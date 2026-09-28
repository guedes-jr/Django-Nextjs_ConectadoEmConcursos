import csv
import datetime as dt
import re
import os
import platform
import shutil
import time
import uuid
from io import StringIO
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.http import HttpResponse
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Avg, Count, F, Max, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.notifications.models import AdminNotification, NotificationRecipient
from apps.billing.models import PaymentEvent, Plan, Subscription
from apps.chat.models import ChatUsage, Conversation, Message
from apps.concursos.models import Concurso, NewsArticle
from apps.questions import moderation
from apps.questions.moderation import REJECTION_REASONS
from apps.questions.models import Exam, OfficialExamDownload, Question, UserAnswer
from apps.studies.models import StudySession
from apps.workspace.models import (
    CommunityPost,
    ExamSubmission,
    Flashcard,
    SimulationRun,
)

from . import services
from .audit import log as audit_log
from .models import AuditEvent
from .serializers import PlanSerializer, SubscriptionAdminSerializer

User = get_user_model()

ROLE_GROUPS = {"admin": "Administrador", "editor": "Editor", "reviewer": "Revisor"}


def _staff_roles(user):
    if user.is_superuser:
        return ["admin"]
    names = set(user.groups.filter(name__in=ROLE_GROUPS.values()).values_list("name", flat=True))
    roles = [role for role, group_name in ROLE_GROUPS.items() if group_name in names]
    return roles or (["admin"] if user.is_staff else [])


def _set_staff_role(user, role):
    if role not in ROLE_GROUPS:
        raise ValueError("Papel inválido. Use admin, editor ou reviewer.")
    user.groups.remove(*Group.objects.filter(name__in=ROLE_GROUPS.values()))
    user.groups.add(Group.objects.get(name=ROLE_GROUPS[role]))


def _superuser_only(request):
    if request.user.is_superuser:
        return None
    return Response({"detail": "Apenas superusuários podem administrar papéis e acessos de staff."}, status=status.HTTP_403_FORBIDDEN)


def _parse_report_datetime(value):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        try:
            parsed = dt.datetime.fromisoformat(value)
        except ValueError:
            return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _report_period(request):
    try:
        days = min(365, max(1, int(request.query_params.get("days", 30))))
    except (TypeError, ValueError):
        days = 30
    now = timezone.now()
    until = _parse_report_datetime(request.query_params.get("until")) or now
    since = _parse_report_datetime(request.query_params.get("since")) or (until - dt.timedelta(days=days))
    if since >= until:
        return None, None, None
    if (until - since).days > 365:
        since = until - dt.timedelta(days=365)
    return since, until, max(1, (until - since).days)


def _audit_payload(item):
    return {
        "id": item.id, "action": item.action, "resource_type": item.resource_type, "resource_id": item.resource_id,
        "actor": {"id": item.actor_id, "username": item.actor.username} if item.actor else None,
        "before": item.before, "after": item.after, "context": item.context, "reason": item.reason,
        "ip_address": item.ip_address, "request_id": str(item.request_id) if item.request_id else None,
        "created_at": item.created_at,
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def audit_events(request):
    queryset = AuditEvent.objects.select_related("actor").all()
    for field in ("action", "resource_type", "resource_id"):
        value = request.query_params.get(field, "").strip()
        if value:
            queryset = queryset.filter(**{field: value})
    actor = request.query_params.get("actor", "").strip()
    if actor.isdigit():
        queryset = queryset.filter(actor_id=int(actor))
    text_query = request.query_params.get("q", "").strip()
    if text_query:
        queryset = queryset.filter(Q(action__icontains=text_query) | Q(resource_type__icontains=text_query) | Q(resource_id__icontains=text_query) | Q(reason__icontains=text_query))
    since = _parse_report_datetime(request.query_params.get("since"))
    until = _parse_report_datetime(request.query_params.get("until"))
    if since:
        queryset = queryset.filter(created_at__gte=since)
    if until:
        queryset = queryset.filter(created_at__lte=until)

    if request.query_params.get("export") == "csv":
        rows = list(queryset[:settings.AUDIT_EXPORT_MAX_ROWS])
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "data_hora", "acao", "recurso", "identificador", "ator", "motivo", "correlation_id"])
        for item in rows:
            writer.writerow([item.id, timezone.localtime(item.created_at).isoformat(), item.action, item.resource_type, item.resource_id, item.actor.username if item.actor else "sistema", item.reason, item.request_id or ""])
        audit_log(request, action="audit.exported", resource_type="audit_event", context={"filters": {"action": request.query_params.get("action", ""), "resource_type": request.query_params.get("resource_type", ""), "since": request.query_params.get("since", ""), "until": request.query_params.get("until", "")}, "rows": len(rows)})
        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = "attachment; filename=auditoria.csv"
        return response

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page = 1
    try:
        limit = min(100, max(1, int(request.query_params.get("limit", 30))))
    except ValueError:
        limit = 30
    total = queryset.count()
    rows = queryset[(page - 1) * limit: page * limit]
    audit_log(request, action="audit.viewed", resource_type="audit_event", context={"filters": {"action": request.query_params.get("action", ""), "resource_type": request.query_params.get("resource_type", ""), "since": request.query_params.get("since", ""), "until": request.query_params.get("until", "")}, "page": page})
    return Response({"total": total, "page": page, "limit": limit, "results": [_audit_payload(item) for item in rows]})

def _staff(request):
    return IsAdminUser().has_permission(request, None)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def editorial_dashboard(request):
    since = timezone.now() - dt.timedelta(hours=24)
    return Response({
        "questions_pending": Question.objects.filter(status=Question.Status.PENDING).count(),
        "article_drafts": NewsArticle.objects.filter(editorial_status=NewsArticle.EditorialStatus.DRAFT).count(),
        "notifications_scheduled": AdminNotification.objects.filter(status=AdminNotification.Status.SCHEDULED).count(),
        "notifications_pending": NotificationRecipient.objects.filter(state=NotificationRecipient.State.PENDING).count(),
        "notification_postponed": NotificationRecipient.objects.filter(state=NotificationRecipient.State.POSTPONED).count(),
        "downloads_failed": OfficialExamDownload.objects.filter(status=OfficialExamDownload.Status.FAILED).count(),
        "audit_failures_24h": AuditEvent.objects.filter(created_at__gte=since, action__icontains="failed").count(),
        "notification_confirmations_24h": NotificationRecipient.objects.filter(state=NotificationRecipient.State.VIEWED, confirmed_at__gte=since).count(),
        "operational_window_hours": 24,
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def diagnostics_overview(request):
    if not request.user.is_superuser or not settings.DIAGNOSTICS_ENABLED:
        return Response({"detail": "Diagnóstico indisponível."}, status=status.HTTP_404_NOT_FOUND)
    disk = shutil.disk_usage(settings.BASE_DIR)
    memory = psutil.virtual_memory() if psutil else None
    cpu_percent = psutil.cpu_percent(interval=None) if psutil else None
    started = time.monotonic()
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    latency_ms = round((time.monotonic() - started) * 1000, 2)
    executor = MigrationExecutor(connection)
    pending = len(executor.migration_plan(executor.loader.graph.leaf_nodes()))
    return Response({"application": {"python": platform.python_version(), "environment": os.getenv("DJANGO_ENV", "unknown"), "time": timezone.now()}, "storage": {"total": disk.total, "used": disk.used, "free": disk.free}, "capacity": {"cpu_percent": cpu_percent, "memory_total": memory.total if memory else None, "memory_used": memory.used if memory else None}, "database": {"vendor": connection.vendor, "connected": True, "latency_ms": latency_ms, "pending_migrations": pending}, "services": {"django": "ok", "worker": "not_checked", "frontend": "not_checked", "proxy": "not_checked"}})


def _finance_access(user):
    return bool(user.is_superuser or user.has_perm("backoffice.view_financial_reports"))


def _active_user_count(since, until):
    answer_users = UserAnswer.objects.filter(created_at__gte=since, created_at__lt=until).order_by().values_list("user_id", flat=True)
    study_users = StudySession.objects.filter(completed_at__gte=since, completed_at__lt=until).order_by().values_list("block__plan__user_id", flat=True)
    chat_users = ChatUsage.objects.filter(created_at__gte=since, created_at__lt=until).order_by().values_list("user_id", flat=True)
    return answer_users.union(study_users, chat_users).count()


def _percentage_change(current, previous):
    if not previous:
        return None
    return round(((current - previous) / previous) * 100, 1)


def _top_values(queryset, *fields, label):
    return [
        {"label": row[label] or "Não informado", "count": row["count"]}
        for row in queryset.values(*fields).annotate(count=Count("id")).order_by("-count", *fields)[:5]
    ]


def _diagnostics_allowed(request):
    return bool(request.user.is_superuser and settings.DIAGNOSTICS_ENABLED)


def _diagnostics_not_found():
    return Response({"detail": "Diagnóstico indisponível."}, status=status.HTTP_404_NOT_FOUND)


def _database_details():
    started = time.monotonic()
    version = "indisponível"
    connections = None
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            if connection.vendor == "sqlite":
                cursor.execute("SELECT sqlite_version()")
            elif connection.vendor == "postgresql":
                cursor.execute("SHOW server_version")
            else:
                cursor.execute("SELECT VERSION()")
            version = str(cursor.fetchone()[0])
            if connection.vendor == "postgresql":
                cursor.execute("SELECT count(*) FROM pg_stat_activity")
                connections = int(cursor.fetchone()[0])
        connected = True
    except Exception:
        connected = False
    return {"vendor": connection.vendor, "version": version, "connected": connected, "latency_ms": round((time.monotonic() - started) * 1000, 2), "active_connections": connections}


def _allowed_log_files():
    files = []
    for configured_path in settings.DIAGNOSTICS_LOG_FILES:
        path = Path(configured_path).expanduser().resolve()
        files.append({"id": path.name, "path": path, "available": path.is_file()})
    return files


def _redact_log_line(line):
    return re.sub(r"(?i)(authorization|token|secret|password|api[_-]?key|cookie)([=:]\s*)([^\s,;]+)", r"\1\2[redigido]", line)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def diagnostics_services(request):
    if not _diagnostics_allowed(request):
        return _diagnostics_not_found()
    load_average = os.getloadavg() if hasattr(os, "getloadavg") else None
    return Response({
        "django": {"status": "ok", "detail": "Processo Django respondeu à requisição."},
        "worker": {"status": "not_checked", "detail": "Configure observabilidade externa para validar worker e agendador."},
        "frontend": {"status": "not_checked", "detail": "O backend não consulta o frontend para evitar chamadas internas não controladas."},
        "proxy": {"status": "not_checked", "detail": "Status deve ser exposto pelo proxy/monitoramento."},
        "host": {"load_average": load_average, "pid": os.getpid()},
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def diagnostics_database(request):
    if not _diagnostics_allowed(request):
        return _diagnostics_not_found()
    details = _database_details()
    executor = MigrationExecutor(connection)
    details["pending_migrations"] = len(executor.migration_plan(executor.loader.graph.leaf_nodes()))
    details["size"] = None
    details["slow_queries"] = {"available": False, "detail": "Configure o monitoramento do banco para consultas lentas."}
    return Response(details)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def diagnostics_logs(request):
    if not _diagnostics_allowed(request):
        return _diagnostics_not_found()
    files = _allowed_log_files()
    service = request.query_params.get("service", "")
    if not service:
        return Response({"results": [{"id": item["id"], "available": item["available"]} for item in files], "detail": "Configure DIAGNOSTICS_LOG_FILES para liberar arquivos específicos." if not files else ""})
    item = next((candidate for candidate in files if candidate["id"] == service), None)
    if item is None or not item["available"]:
        return Response({"detail": "Log não disponível."}, status=status.HTTP_404_NOT_FOUND)
    try:
        limit = min(200, max(1, int(request.query_params.get("lines", 100))))
    except ValueError:
        limit = 100
    search = request.query_params.get("q", "").strip().lower()
    with item["path"].open("r", encoding="utf-8", errors="replace") as log_file:
        lines = log_file.readlines()[-2000:]
    if search:
        lines = [line for line in lines if search in line.lower()]
    result = [_redact_log_line(line.rstrip())[:2000] for line in lines[-limit:]]
    audit_log(request, action="diagnostics.logs.viewed", resource_type="diagnostic_log", resource_id=item["id"], context={"lines": len(result), "search": bool(search)})
    return Response({"service": item["id"], "lines": result, "truncated": len(lines) > limit})


def _diagnostic_script_summary_counts():
    return {"users": User.objects.count(), "active_subscriptions": Subscription.objects.filter(status=Subscription.Status.ACTIVE).count(), "questions_pending": Question.objects.filter(status=Question.Status.PENDING).count(), "audit_events": AuditEvent.objects.count()}


def _diagnostic_script_recent_failures():
    return [{"id": item.id, "action": item.action, "resource_type": item.resource_type, "created_at": item.created_at} for item in AuditEvent.objects.filter(action__icontains="failed").order_by("-created_at")[:50]]


DIAGNOSTIC_SCRIPTS = {
    "summary-counts": {"title": "Contagens resumidas", "description": "Consulta somente leitura de contagens operacionais.", "run": _diagnostic_script_summary_counts},
    "recent-failures": {"title": "Falhas recentes", "description": "Lista até 50 eventos de auditoria com ação contendo failed.", "run": _diagnostic_script_recent_failures},
}


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def diagnostics_scripts(request):
    if not _diagnostics_allowed(request):
        return _diagnostics_not_found()
    if request.method == "GET":
        return Response({"results": [{"id": script_id, "title": item["title"], "description": item["description"], "mode": "read_only"} for script_id, item in DIAGNOSTIC_SCRIPTS.items()]})
    script_id = str(request.data.get("script", ""))
    script = DIAGNOSTIC_SCRIPTS.get(script_id)
    if script is None:
        return Response({"detail": "Script não permitido."}, status=status.HTTP_400_BAD_REQUEST)
    started = time.monotonic()
    result = script["run"]()
    elapsed_ms = round((time.monotonic() - started) * 1000, 2)
    audit_log(request, action="diagnostics.script.executed", resource_type="diagnostic_script", resource_id=script_id, context={"mode": "read_only", "elapsed_ms": elapsed_ms})
    return Response({"script": script_id, "mode": "read_only", "elapsed_ms": elapsed_ms, "result": result})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def business_reports(request):
    since, until, days = _report_period(request)
    if since is None:
        return Response({"detail": "O período informado é inválido."}, status=status.HTTP_400_BAD_REQUEST)
    previous_since = since - (until - since)
    financial_access = _finance_access(request.user)

    current_users = User.objects.filter(date_joined__gte=since, date_joined__lt=until).count()
    previous_users = User.objects.filter(date_joined__gte=previous_since, date_joined__lt=since).count()
    active_users = _active_user_count(since, until)
    active_dau = _active_user_count(until - dt.timedelta(days=1), until)
    active_wau = _active_user_count(until - dt.timedelta(days=7), until)
    active_mau = _active_user_count(until - dt.timedelta(days=30), until)
    signups_with_study = User.objects.filter(date_joined__gte=since, date_joined__lt=until, study_plans__blocks__sessions__completed_at__gte=since, study_plans__blocks__sessions__completed_at__lt=until).distinct().count()
    signed_up_with_active_subscription = User.objects.filter(date_joined__gte=since, date_joined__lt=until, subscription__status=Subscription.Status.ACTIVE).count()

    answers = UserAnswer.objects.filter(created_at__gte=since, created_at__lt=until)
    pending_questions = Question.objects.filter(status=Question.Status.PENDING)
    queue_dates = list(pending_questions.order_by("created_at").values_list("created_at", flat=True)[:10000])
    queue_average_age_hours = round(sum((until - created).total_seconds() / 3600 for created in queue_dates) / len(queue_dates), 1) if queue_dates else 0
    payments = PaymentEvent.objects.filter(created_at__gte=since, created_at__lt=until)

    payload = {
        "period": {"since": since, "until": until, "days": days, "generated_at": timezone.now()},
        "definitions": {
            "active_user": "Usuário com ao menos uma resposta, sessão de estudo ou uso do chat no período.",
            "activation": "Cadastro que concluiu ao menos uma sessão de estudo no mesmo período.",
            "financial": "Receita recebida em moeda não é exibida enquanto o provedor não persistir valores normalizados por evento.",
        },
        "financial": {"access_granted": financial_access},
        "growth": {
            "new_users": current_users,
            "previous_new_users": previous_users,
            "new_users_change_percent": _percentage_change(current_users, previous_users),
            "active_users": active_users,
            "dau": active_dau,
            "wau": active_wau,
            "mau": active_mau,
            "activation_rate_percent": round((signups_with_study / current_users) * 100, 1) if current_users else 0,
            "signup_to_active_subscription_percent": round((signed_up_with_active_subscription / current_users) * 100, 1) if current_users else 0,
            "daily_signups": [{"date": row["date"], "count": row["count"]} for row in User.objects.filter(date_joined__gte=since, date_joined__lt=until).annotate(date=TruncDate("date_joined")).values("date").annotate(count=Count("id")).order_by("date")],
            "acquisition": {"available": False, "message": "UTM/referrer persistido ainda não está disponível."},
        },
        "product": {
            "questions_answered": answers.count(),
            "correct_answers": answers.filter(is_correct=True).count(),
            "correct_rate_percent": round((answers.filter(is_correct=True).count() / answers.count()) * 100, 1) if answers.exists() else 0,
            "study_sessions": StudySession.objects.filter(completed_at__gte=since, completed_at__lt=until).count(),
            "study_minutes": StudySession.objects.filter(completed_at__gte=since, completed_at__lt=until).aggregate(total=Sum("minutes"))["total"] or 0,
            "simulations_finished": SimulationRun.objects.filter(status=SimulationRun.Status.FINISHED, finished_at__gte=since, finished_at__lt=until).count(),
            "flashcards_created": Flashcard.objects.filter(created_at__gte=since, created_at__lt=until).count(),
            "chat_queries": ChatUsage.objects.filter(created_at__gte=since, created_at__lt=until).count(),
            "top_disciplines": _top_values(answers.select_related("question__exam"), "question__discipline", label="question__discipline"),
            "top_bancas": _top_values(answers.select_related("question__exam"), "question__banca", label="question__banca"),
            "top_exams": _top_values(answers.exclude(question__exam__isnull=True).select_related("question__exam"), "question__exam__title", label="question__exam__title"),
            "article_access": {"available": False, "message": "Visualizações de artigos ainda não são registradas."},
        },
        "operation": {
            "questions_pending": pending_questions.count(),
            "questions_approved": Question.objects.filter(status=Question.Status.APPROVED).count(),
            "questions_rejected": Question.objects.filter(status=Question.Status.REJECTED).count(),
            "queue_average_age_hours": queue_average_age_hours,
            "queue_age_sample_size": len(queue_dates),
            "queue_oldest_at": queue_dates[0] if queue_dates else None,
            "payments_received": payments.filter(type=PaymentEvent.Type.SUCCEEDED).count(),
            "payments_failed": payments.filter(type=PaymentEvent.Type.FAILED).count(),
            "renewals": payments.filter(type=PaymentEvent.Type.RENEWED).count(),
            "cancellations": payments.filter(type=PaymentEvent.Type.CANCELED).count(),
        },
    }
    if financial_access:
        active = Subscription.objects.filter(status=Subscription.Status.ACTIVE).select_related("plan")
        mrr = active.aggregate(total=Sum("plan__monthly_price"))["total"] or 0
        payload["financial"].update({
            "mrr": mrr,
            "arr": mrr * 12,
            "active_subscriptions": active.count(),
            "new_paid_subscriptions": Subscription.objects.filter(status=Subscription.Status.ACTIVE, created_at__gte=since, created_at__lt=until).count(),
            "pending_subscriptions": Subscription.objects.filter(status=Subscription.Status.PENDING).count(),
            "canceled_subscriptions": Subscription.objects.filter(status=Subscription.Status.CANCELED, updated_at__gte=since, updated_at__lt=until).count(),
            "plan_distribution": [{"plan": row["plan__name"], "cycle": row["cycle"], "count": row["count"]} for row in active.values("plan__name", "cycle").annotate(count=Count("id")).order_by("plan__name", "cycle")],
            "received_revenue": None,
            "received_revenue_status": "indisponível: PaymentEvent não possui valor monetário normalizado.",
        })

    audit_log(request, action="report.viewed", resource_type="business_report", context={"since": since, "until": until, "financial_access": financial_access})
    if request.query_params.get("export") == "csv":
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["indicador", "valor"])
        for section in ("financial", "growth", "product", "operation"):
            for key, value in payload[section].items():
                if not isinstance(value, (dict, list)):
                    writer.writerow([f"{section}.{key}", value])
        audit_log(request, action="report.exported", resource_type="business_report", context={"since": since, "until": until, "financial_access": financial_access})
        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = "attachment; filename=relatorio-negocio.csv"
        return response
    return Response(payload)

@api_view(["GET"])
@permission_classes([IsAdminUser])
def overview(request):
    sub_with_comment = Question.objects.exclude(explanation="").order_by().values("id")
    news_unpublished = NewsArticle.objects.filter(is_published=False).count()
    posts = CommunityPost.objects.count()
    sub = Subscription.objects
    backups = services.list_backups()
    recent_subs = Subscription.objects.select_related("user", "plan").order_by(
        "-created_at"
    )[:5]
    recent_users = User.objects.order_by("-date_joined")[:5]
    return Response(
        {
            "users": {
                "total": User.objects.count(),
                "active": User.objects.filter(is_active=True).count(),
                "staff": User.objects.filter(is_staff=True).count(),
            },
            "subscriptions": {
                "total": sub.count(),
                "active": sub.filter(status=Subscription.Status.ACTIVE).count(),
                "pending_payment": sub.filter(
                    status=Subscription.Status.PENDING
                ).count(),
                "canceled": sub.filter(status=Subscription.Status.CANCELED).count(),
            },
            "plans": {
                "total": Plan.objects.count(),
                "active": Plan.objects.filter(is_active=True).count(),
            },
            "questions": {
                "total": Question.objects.count(),
                "uncommented": Question.objects.filter(explanation="").count(),
                "with_comment": Question.objects.exclude(explanation="").count(),
            },
            "proofs": {
                "pending": ExamSubmission.objects.filter(
                    status=ExamSubmission.Status.PENDING
                ).count(),
                "reviewed": ExamSubmission.objects.filter(
                    status=ExamSubmission.Status.REVIEWED
                ).count(),
            },
            "content": {
                "news_total": NewsArticle.objects.count(),
                "news_unpublished": news_unpublished,
                "community_posts": posts,
                "concursos_total": Concurso.objects.count(),
                "concursos_open": Concurso.objects.filter(
                    status=Concurso.Status.OPEN
                ).count(),
            },
            "backups": {
                "count": len(backups),
                "last": backups[0]["name"] if backups else None,
                "last_created_at": backups[0]["created_at"] if backups else None,
            },
            "recent_subscriptions": [
                {
                    "id": s.id,
                    "username": s.user.username,
                    "plan": s.plan.name,
                    "status": s.status,
                    "cycle": s.cycle,
                    "created_at": s.created_at.isoformat(),
                }
                for s in recent_subs
            ],
            "recent_users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "is_staff": u.is_staff,
                    "date_joined": u.date_joined.isoformat(),
                }
                for u in recent_users
            ],
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def list_users(request):
    search = request.query_params.get("search", "").strip()
    limit = min(100, max(1, int(request.query_params.get("limit", 50))))
    offset = max(0, int(request.query_params.get("offset", 0)))
    qs = User.objects.all()
    if search:
        qs = qs.filter(username__icontains=search) | qs.filter(email__icontains=search)
    rows = []
    for u in qs.order_by("-date_joined")[offset:offset + limit]:
        sub = getattr(u, "subscription", None)
        rows.append(
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "is_staff": u.is_staff,
                "is_active": u.is_active,
                "date_joined": u.date_joined.isoformat(),
                "subscription": (
                    {
                        "id": sub.id,
                        "plan": sub.plan.name,
                        "plan_slug": sub.plan.slug,
                        "status": sub.status,
                        "cycle": sub.cycle,
                    }
                    if sub
                    else None
                ),
            }
        )
    return Response({"results": rows, "total": qs.count(), "offset": offset, "limit": limit})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def update_user(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND
        )
    before = {"is_active": user.is_active}
    if "is_active" in request.data and isinstance(request.data["is_active"], bool):
        user.is_active = request.data["is_active"]
        user.save(update_fields=["is_active"])
        audit_log(request, action="user.access_updated", resource_type="user", resource_id=user.id, before=before, after={"is_active": user.is_active})
    return Response({"id": user.id, "is_active": user.is_active})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def assign_subscription(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND
        )
    plan = Plan.objects.filter(slug=request.data.get("plan", "")).first()
    if not plan:
        return Response(
            {"detail": "Plano inválido."}, status=status.HTTP_400_BAD_REQUEST
        )
    cycle = request.data.get("cycle", Subscription.Cycle.MONTHLY)
    status_ = (
        Subscription.Status.ACTIVE
        if plan.monthly_price == 0
        else Subscription.Status.PENDING
    )
    sub, _ = Subscription.objects.update_or_create(
        user=user,
        defaults={"plan": plan, "cycle": cycle, "status": status_},
    )
    payload = {"id": sub.id, "status": sub.status, "plan": plan.name}
    audit_log(request, action="subscription.assigned", resource_type="subscription", resource_id=sub.id, after=payload)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def list_subscriptions(request):
    status_filter = request.query_params.get("status", "").strip()
    search = request.query_params.get("search", "").strip()
    qs = Subscription.objects.select_related("user", "plan").order_by("-created_at")
    if status_filter:
        qs = qs.filter(status=status_filter)
    if search:
        qs = qs.filter(user__username__icontains=search) | qs.filter(
            user__email__icontains=search
        )
    return Response({"results": SubscriptionAdminSerializer(qs[:200], many=True).data})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def update_subscription(request, pk):
    try:
        sub = Subscription.objects.select_for_update().get(pk=pk)
    except Subscription.DoesNotExist:
        return Response(
            {"detail": "Assinatura não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )
    data = request.data
    before = {"plan": sub.plan.slug, "cycle": sub.cycle, "status": sub.status}
    if "plan" in data:
        plan = Plan.objects.filter(slug=data["plan"]).first()
        if not plan:
            return Response(
                {"detail": "Plano inválido."}, status=status.HTTP_400_BAD_REQUEST
            )
        sub.plan = plan
    if "cycle" in data:
        sub.cycle = data["cycle"]
    if "status" in data:
        sub.status = data["status"]
    sub.save()
    payload = SubscriptionAdminSerializer(sub).data
    audit_log(request, action="subscription.updated", resource_type="subscription", resource_id=sub.id, before=before, after={"plan": sub.plan.slug, "cycle": sub.cycle, "status": sub.status})
    return Response(payload)


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def plans(request):
    if request.method == "POST":
        ser = PlanSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        plan = ser.save()
        audit_log(request, action="plan.created", resource_type="plan", resource_id=plan.id, after=ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)
    qs = Plan.objects.order_by("sort_order", "name")
    return Response({"results": PlanSerializer(qs, many=True).data})


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def plan_detail(request, pk):
    try:
        plan = Plan.objects.get(pk=pk)
    except Plan.DoesNotExist:
        return Response(
            {"detail": "Plano não encontrado."}, status=status.HTTP_404_NOT_FOUND
        )
    if request.method == "DELETE":
        if Subscription.objects.filter(plan=plan).exists():
            return Response(
                {"detail": "Plano em uso por assinaturas."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        before = PlanSerializer(plan).data
        plan_id = plan.id
        plan.delete()
        audit_log(request, action="plan.deleted", resource_type="plan", resource_id=plan_id, before=before)
        return Response(status=status.HTTP_204_NO_CONTENT)
    before = PlanSerializer(plan).data
    ser = PlanSerializer(plan, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    audit_log(request, action="plan.updated", resource_type="plan", resource_id=plan.id, before=before, after=ser.data)
    return Response(ser.data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminUser])
def proofs(request):
    if request.method == "GET":
        status_filter = request.query_params.get("status", "").strip()
        qs = ExamSubmission.objects.select_related("user", "converted_run").order_by("-created_at")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(
            {
                "results": [
                    {
                        "id": p.id,
                        "username": p.user.username,
                        "title": p.title,
                        "status": p.status,
                        # O arquivo e a descrição são o insumo da conversão: sem eles
                        # o admin não sabe o que colar no formulário.
                        "file_url": request.build_absolute_uri(p.file.url) if p.file else None,
                        "source_url": p.source_url,
                        "description": p.description,
                        "rights_confirmed": p.rights_confirmed,
                        "converted_questions": p.converted_questions,
                        "converted_run": p.converted_run_id,
                        "created_at": p.created_at.isoformat(),
                    }
                    for p in qs[:200]
                ]
            }
        )
    return update_proof_status(request)


def update_proof_status(request):
    pk = request.data.get("id")
    try:
        proof = ExamSubmission.objects.get(pk=pk)
    except ExamSubmission.DoesNotExist:
        return Response(
            {"detail": "Prova não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )
    new_status = request.data.get("status")
    if new_status not in ExamSubmission.Status.values:
        return Response(
            {"detail": "Status inválido."}, status=status.HTTP_400_BAD_REQUEST
        )
    proof.status = new_status
    proof.save(update_fields=["status"])
    return Response({"id": proof.id, "status": proof.status})


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminUser])
def questions_admin(request):
    if request.method == "GET":
        only_empty = request.query_params.get("only_uncommented") == "1"
        search = request.query_params.get("search", "").strip()
        status_filter = request.query_params.get(
            "status", Question.Status.PENDING
        ).strip()
        try:
            limit = max(1, min(int(request.query_params.get("limit", 50)), 200))
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(0, int(request.query_params.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0

        qs = Question.objects.select_related("exam", "source", "reviewed_by").order_by(
            "status", "-created_at"
        )
        if status_filter:
            qs = qs.filter(status=status_filter)
        if only_empty:
            qs = qs.filter(explanation="")
        if search:
            qs = qs.filter(statement__icontains=search) | qs.filter(
                discipline__icontains=search
            )

        total = qs.count()
        page_qs = qs[offset : offset + limit]
        return Response(
            {
                "total": total,
                "limit": limit,
                "offset": offset,
                "results": [
                    {
                        "id": q.id,
                        "status": q.status,
                        "source": q.source.slug if q.source else None,
                        "exam_title": q.exam.title if q.exam else None,
                        "discipline": q.discipline,
                        "banca": q.banca,
                        "year": q.year,
                        "statement": q.statement,
                        "options": q.options,
                        "correct_answer": q.correct_answer,
                        "explanation": q.explanation,
                        "review_note": q.review_note,
                        "rejection_reason": q.rejection_reason,
                        "rejection_reason_code": q.rejection_reason_code,
                        "reviewed_by": q.reviewed_by.username
                        if q.reviewed_by
                        else None,
                        "reviewed_at": q.reviewed_at.isoformat()
                        if q.reviewed_at
                        else None,
                    }
                    for q in page_qs
                ],
            }
        )

    # PATCH — todas as escritas passam pelo moderation.py
    pk = request.data.get("id")
    try:
        question = Question.objects.get(pk=pk)
    except Question.DoesNotExist:
        return Response(
            {"detail": "Questão não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )

    mod_action = request.data.get("action", "").strip()

    if mod_action == "approve":
        explanation = request.data.get("explanation")
        try:
            moderation.approve(question, request.user, explanation)
        except Exception as exc:
            from django.core.exceptions import ValidationError as DjangoValidationError

            if isinstance(exc, DjangoValidationError):
                detail = (
                    exc.message_dict if hasattr(exc, "message_dict") else exc.messages
                )
                return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
            raise
        return Response(
            {"id": question.id, "status": question.status}
        )

    if mod_action == "reject":
        reason = (request.data.get("rejection_reason") or "").strip()
        reason_code = (request.data.get("rejection_reason_code") or "").strip()
        try:
            moderation.reject(question, request.user, reason, reason_code)
        except Exception as exc:
            from django.core.exceptions import ValidationError as DjangoValidationError

            if isinstance(exc, DjangoValidationError):
                detail = (
                    exc.message_dict if hasattr(exc, "message_dict") else exc.messages
                )
                return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
            raise
        return Response(
            {"id": question.id, "status": question.status}
        )

    if mod_action == "reopen":
        note = (request.data.get("review_note") or "").strip()
        moderation.reopen(question, request.user, note)
        return Response(
            {"id": question.id, "status": question.status}
        )

    # Sem action: edição de rascunho de explicação antes de aprovar
    if "explanation" in request.data:
        question.explanation = request.data["explanation"]
        question.save(update_fields=["explanation", "updated_at"])
        return Response({"id": question.id, "explanation": question.explanation})

    return Response(
        {
            "detail": (
                f"Informe 'action' (approve | reject | reopen) ou 'explanation'. "
                f"Motivos aceitos: {', '.join(sorted(REJECTION_REASONS))}."
            )
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminUser])
def news_admin(request):
    if request.method == "GET":
        published = request.query_params.get("published", "").strip()
        qs = NewsArticle.objects.order_by("-published_at", "-fetched_at")
        if published:
            qs = qs.filter(is_published=published == "1")
        return Response(
            {
                "results": [
                    {
                        "id": n.id,
                        "title": n.title,
                        "category": n.category,
                        "is_published": n.is_published,
                        "published_at": n.published_at.isoformat()
                        if n.published_at
                        else None,
                    }
                    for n in qs[:100]
                ]
            }
        )
    pk = request.data.get("id")
    try:
        news = NewsArticle.objects.get(pk=pk)
    except NewsArticle.DoesNotExist:
        return Response(
            {"detail": "Notícia não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )
    if "is_published" in request.data and isinstance(
        request.data["is_published"], bool
    ):
        news.is_published = request.data["is_published"]
        news.save(update_fields=["is_published"])
    return Response({"id": news.id, "is_published": news.is_published})


@api_view(["GET", "DELETE"])
@permission_classes([IsAdminUser])
def community_admin(request):
    if request.method == "DELETE":
        pk = request.query_params.get("id") or (
            request.data.get("id") if request.data else None
        )
        CommunityPost.objects.filter(pk=pk).delete()
        return Response({"deleted": pk})
    kind = request.query_params.get("kind", "").strip()
    qs = (
        CommunityPost.objects.select_related("user")
        .annotate(replies=Count("replies"))
        .order_by("-created_at")
    )
    if kind:
        qs = qs.filter(kind=kind)
    return Response(
        {
            "results": [
                {
                    "id": p.id,
                    "username": p.user.username,
                    "kind": p.kind,
                    "title": p.title,
                    "replies": p.replies,
                    "created_at": p.created_at.isoformat(),
                }
                for p in qs[:200]
            ]
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def concursos_admin(request):
    search = request.query_params.get("search", "").strip()
    qs = Concurso.objects.order_by("-fetched_at")
    if search:
        qs = qs.filter(title__icontains=search)
    return Response(
        {
            "total": qs.count(),
            "results": [
                {
                    "id": c.id,
                    "title": c.title,
                    "organization": c.organization,
                    "state": c.state,
                    "status": c.status,
                    "deadline": c.deadline.isoformat() if c.deadline else None,
                    "published_at": c.published_at.isoformat()
                    if c.published_at
                    else None,
                }
                for c in qs[:100]
            ],
        }
    )


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def backups(request):
    if request.method == "POST":
        name = services.create_backup()
        audit_log(request, action="backup.created", resource_type="backup", resource_id=name, after={"name": name})
        return Response({"name": name}, status=status.HTTP_201_CREATED)
    return Response({"results": services.list_backups()})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def restore(request, name):
    try:
        result = services.restore_backup(name)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    audit_log(request, action="backup.restored", resource_type="backup", resource_id=name, after={"backup": name, "previous_db_saved_at": result.get("previous_db_saved_at")})
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def chat_usage(request):
    days = int(request.query_params.get("days", 14))
    today = timezone.localdate()
    since = today - dt.timedelta(days=days)

    agg = ChatUsage.objects.aggregate(
        queries=Count("id"),
        input_tokens=Sum("input_tokens"),
        output_tokens=Sum("output_tokens"),
    )

    daily_qs = (
        ChatUsage.objects.filter(created_at__date__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            queries=Count("id"), tokens=Sum("input_tokens") + Sum("output_tokens")
        )
        .order_by("day")
    )
    daily_map = {row["day"]: row for row in daily_qs}
    daily = []
    for offset in range(days):
        day = since + dt.timedelta(days=offset)
        row = daily_map.get(day)
        daily.append(
            {
                "date": day.isoformat(),
                "queries": row["queries"] if row else 0,
                "tokens": row["tokens"] or 0 if row else 0,
            }
        )

    top_users = (
        ChatUsage.objects.select_related("user")
        .values("user__id", "user__username")
        .annotate(
            queries=Count("id"),
            tokens=Sum("input_tokens") + Sum("output_tokens"),
            last_used=Max("created_at"),
        )
        .order_by("-tokens")[:10]
    )

    return Response(
        {
            "conversations": Conversation.objects.count(),
            "messages": Message.objects.filter(role=Message.Role.ASSISTANT).count(),
            "queries": agg["queries"] or 0,
            "input_tokens": agg["input_tokens"] or 0,
            "output_tokens": agg["output_tokens"] or 0,
            "active_users": ChatUsage.objects.filter(created_at__date__gte=since)
            .values("user_id")
            .distinct()
            .count(),
            "daily": daily,
            "top_users": [
                {
                    "user_id": u["user__id"],
                    "username": u["user__username"],
                    "queries": u["queries"],
                    "tokens": u["tokens"] or 0,
                    "last_used": u["last_used"].isoformat() if u["last_used"] else None,
                }
                for u in top_users
            ],
        }
    )


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def staff(request):
    denied = _superuser_only(request)
    if denied:
        return denied
    if request.method == "POST":
        data = request.data
        username = (data.get("username") or "").strip()
        email = (data.get("email") or "").strip()
        password = data.get("password") or ""
        if not username or not password:
            return Response(
                {"detail": "Usuário e senha são obrigatórios."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if User.objects.filter(username=username).exists():
            return Response(
                {"detail": "Já existe um usuário com esse nome."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = User.objects.create_user(
            username=username, email=email, password=password, is_staff=True
        )
        try:
            _set_staff_role(user, str(data.get("role", "reviewer")))
        except (ValueError, Group.DoesNotExist) as exc:
            user.delete()
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        payload = _staff_payload(user)
        audit_log(request, action="staff.created", resource_type="user", resource_id=user.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)

    qs = User.objects.filter(is_staff=True).order_by("username")
    return Response({"results": [_staff_payload(u) for u in qs]})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def staff_detail(request, pk):
    denied = _superuser_only(request)
    if denied:
        return denied
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND
        )
    data = request.data
    before = _staff_payload(user)
    if "is_staff" in data and user.pk == request.user.pk:
        return Response(
            {"detail": "Você não pode alterar o próprio cargo."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    for field in ("is_staff", "is_active", "email", "first_name", "last_name"):
        if field in data:
            setattr(user, field, data[field])
    try:
        if "role" in data and user.pk != request.user.pk:
            _set_staff_role(user, str(data["role"]))
    except (ValueError, Group.DoesNotExist) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    user.save()
    payload = _staff_payload(user)
    audit_log(request, action="staff.updated", resource_type="user", resource_id=user.id, before=before, after=payload)
    return Response(payload)


def _staff_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "roles": _staff_roles(user),
        "is_active": user.is_active,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "date_joined": user.date_joined.isoformat(),
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def study_reports(request):
    days = int(request.query_params.get("days", 14))
    today = timezone.localdate()
    since = today - dt.timedelta(days=days)

    total_answers = UserAnswer.objects.count()
    correct_answers = UserAnswer.objects.filter(is_correct=True).count()
    total_minutes = StudySession.objects.aggregate(total=Sum("minutes"))["total"] or 0
    simulations = SimulationRun.objects
    sim_total = simulations.count()
    scored = simulations.filter(total__gt=0)
    sim_score = scored.aggregate(avg=Avg("score"))["avg"] or 0
    max_percent = scored.aggregate(m=Max(F("score") * 100.0 / F("total")))["m"]

    daily_answers = (
        UserAnswer.objects.filter(created_at__date__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
        .order_by("day")
    )
    daily_minutes = (
        StudySession.objects.filter(completed_at__date__gte=since)
        .annotate(day=TruncDate("completed_at"))
        .values("day")
        .annotate(minutes=Sum("minutes"))
        .order_by("day")
    )
    answers_map = {row["day"]: row for row in daily_answers}
    minutes_map = {row["day"]: row["minutes"] for row in daily_minutes}
    daily = []
    for offset in range(days):
        day = since + dt.timedelta(days=offset)
        a = answers_map.get(day)
        daily.append(
            {
                "date": day.isoformat(),
                "answers": a["total"] if a else 0,
                "correct": a["correct"] if a else 0,
                "minutes": minutes_map.get(day, 0),
            }
        )

    top_students = (
        UserAnswer.objects.select_related("user")
        .values("user__id", "user__username")
        .annotate(
            total=Count("id"),
            correct=Count("id", filter=Q(is_correct=True)),
            last_activity=Max("created_at"),
        )
        .order_by("-total")[:10]
    )
    minutes_by_user = {
        row["user_id"]: row["minutes"]
        for row in (
            StudySession.objects.annotate(user_id=F("block__plan__user_id"))
            .values("user_id")
            .annotate(minutes=Sum("minutes"))
        )
    }

    by_discipline = (
        UserAnswer.objects.select_related("question")
        .values("question__discipline")
        .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
        .order_by("-total")[:8]
    )

    active_user_ids = (
        UserAnswer.objects.filter(created_at__date__gte=since)
        .values_list("user_id", flat=True)
        .distinct()
    )
    active_user_ids = set(active_user_ids)
    active_user_ids.update(
        SimulationRun.objects.filter(created_at__date__gte=since).values_list(
            "user_id", flat=True
        )
    )
    active_user_ids.update(
        StudySession.objects.filter(completed_at__date__gte=since).values_list(
            "block__plan__user_id", flat=True
        )
    )
    active_user_ids.update(
        ChatUsage.objects.filter(created_at__date__gte=since).values_list(
            "user_id", flat=True
        )
    )

    return Response(
        {
            "total_answers": total_answers,
            "correct_answers": correct_answers,
            "accuracy": round(correct_answers / total_answers * 100, 1)
            if total_answers
            else 0,
            "total_minutes": total_minutes,
            "flashcards": Flashcard.objects.count(),
            "simulations": {
                "total": sim_total,
                "avg_score": round(sim_score, 1),
                "max_score": round(max_percent, 1) if max_percent is not None else None,
            },
            "active_users": len(active_user_ids),
            "daily": daily,
            "top_students": [
                {
                    "user_id": s["user__id"],
                    "username": s["user__username"],
                    "answers": s["total"],
                    "correct": s["correct"],
                    "minutes": minutes_by_user.get(s["user__id"], 0),
                    "last_activity": s["last_activity"].isoformat()
                    if s["last_activity"]
                    else None,
                }
                for s in top_students
            ],
            "by_discipline": [
                {
                    "discipline": d["question__discipline"] or "Sem disciplina",
                    "total": d["total"],
                    "correct": d["correct"],
                }
                for d in by_discipline
            ],
        }
    )


def _editorial_concurso_payload(item):
    return {"id": item.id, "title": item.title, "organization": item.organization, "state": item.state,
            "status": item.status, "deadline": item.deadline, "source_url": item.source_url,
            "origin": item.origin, "editorial_status": item.editorial_status,
            "exams_count": item.exams.count(), "updated_at": item.fetched_at}


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def editorial_concursos(request):
    if request.method == "POST":
        title = str(request.data.get("title", "")).strip()
        if not title:
            return Response({"title": ["Informe o título do concurso."]}, status=status.HTTP_400_BAD_REQUEST)
        item = Concurso.objects.create(source="manual", external_id=f"manual:{uuid.uuid4()}", origin=Concurso.Origin.MANUAL,
            title=title, organization=str(request.data.get("organization", "")).strip(), state=str(request.data.get("state", "")).strip().upper()[:2],
            status=request.data.get("status", Concurso.Status.EXPECTED), source_url=str(request.data.get("source_url", "")).strip(),
            created_by=request.user, updated_by=request.user)
        payload = _editorial_concurso_payload(item)
        audit_log(request, action="concurso.created", resource_type="concurso", resource_id=item.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)
    qs = Concurso.objects.prefetch_related("exams").order_by("-fetched_at")
    if origin := request.query_params.get("origin"):
        qs = qs.filter(origin=origin)
    if search := request.query_params.get("search"):
        qs = qs.filter(Q(title__icontains=search) | Q(organization__icontains=search))
    return Response({"results": [_editorial_concurso_payload(item) for item in qs[:200]]})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def editorial_concurso_detail(request, pk):
    item = Concurso.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "Concurso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if "editorial_status" in request.data:
        if request.data["editorial_status"] not in Concurso.EditorialStatus.values:
            return Response({"editorial_status": ["Estado editorial inválido."]}, status=status.HTTP_400_BAD_REQUEST)
        item.editorial_status = request.data["editorial_status"]
    if item.origin == Concurso.Origin.IMPORTED and any(key in request.data for key in ("title", "organization", "state", "status", "source_url")):
        return Response({"detail": "Campos de concursos importados são protegidos contra a sincronização."}, status=status.HTTP_409_CONFLICT)
    if item.origin == Concurso.Origin.MANUAL:
        for field in ("title", "organization", "state", "status", "source_url"):
            if field in request.data:
                setattr(item, field, str(request.data[field]).strip())
    before = _editorial_concurso_payload(item)
    item.updated_by = request.user
    item.save()
    payload = _editorial_concurso_payload(item)
    audit_log(request, action="concurso.updated", resource_type="concurso", resource_id=item.id, before=before, after=payload)
    return Response(payload)


def _editorial_exam_payload(item):
    return {"id": item.id, "title": item.title, "banca": item.banca, "institution": item.institution,
            "role": item.role, "year": item.year, "is_published": item.is_published,
            "concurso": item.concurso_id, "questions_count": item.questions.count(), "updated_at": item.updated_at}


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def editorial_exams(request):
    if request.method == "POST":
        required = {key: request.data.get(key) for key in ("title", "banca", "year")}
        if not all(str(value or "").strip() for value in required.values()):
            return Response({"detail": "Informe título, banca e ano da prova."}, status=status.HTTP_400_BAD_REQUEST)
        concurso = Concurso.objects.filter(pk=request.data.get("concurso")).first() if request.data.get("concurso") else None
        item = Exam.objects.create(title=str(required["title"]).strip(), banca=str(required["banca"]).strip(), year=int(required["year"]),
            institution=str(request.data.get("institution", "")).strip(), role=str(request.data.get("role", "")).strip(), concurso=concurso,
            is_published=bool(request.data.get("is_published", False)), created_by=request.user, updated_by=request.user)
        return Response(_editorial_exam_payload(item), status=status.HTTP_201_CREATED)
    qs = Exam.objects.select_related("concurso").prefetch_related("questions").order_by("-year", "title")
    if concurso := request.query_params.get("concurso"):
        qs = qs.filter(concurso_id=concurso)
    if search := request.query_params.get("search"):
        qs = qs.filter(Q(title__icontains=search) | Q(banca__icontains=search))
    return Response({"results": [_editorial_exam_payload(item) for item in qs[:200]]})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def editorial_exam_detail(request, pk):
    item = Exam.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "Prova não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    for field in ("title", "banca", "institution", "role", "level", "state", "is_published"):
        if field in request.data:
            setattr(item, field, request.data[field])
    if "concurso" in request.data:
        item.concurso = Concurso.objects.filter(pk=request.data["concurso"]).first() if request.data["concurso"] else None
    before = _editorial_exam_payload(item)
    item.updated_by = request.user
    item.save()
    payload = _editorial_exam_payload(item)
    audit_log(request, action="exam.updated", resource_type="exam", resource_id=item.id, before=before, after=payload)
    return Response(payload)

def _article_payload(item):
    return {"id": item.id, "title": item.title, "slug": item.slug, "summary": item.summary, "body": item.body, "category": item.category, "image_url": item.image_url, "origin": item.origin, "editorial_status": item.editorial_status, "scheduled_for": item.scheduled_for, "is_published": item.is_published}

@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def editorial_news(request):
    from django.utils.text import slugify
    if request.method == "POST":
        title = str(request.data.get("title", "")).strip(); body = str(request.data.get("body", "")).strip()
        if not title or not body: return Response({"detail": "Informe título e conteúdo do artigo."}, status=status.HTTP_400_BAD_REQUEST)
        base = slugify(request.data.get("slug") or title)[:250] or "artigo"; slug = base; index = 2
        while NewsArticle.objects.filter(slug=slug).exists(): slug = f"{base[:245]}-{index}"; index += 1
        item = NewsArticle.objects.create(source="manual", external_id=f"manual:{uuid.uuid4()}", origin=Concurso.Origin.MANUAL, title=title, body=body, slug=slug, summary=str(request.data.get("summary", "")).strip(), category=str(request.data.get("category", "")).strip(), image_url=str(request.data.get("image_url", "")).strip(), editorial_status=NewsArticle.EditorialStatus.DRAFT, is_published=False, author=request.user, updated_by=request.user)
        payload = _article_payload(item)
        audit_log(request, action="article.created", resource_type="article", resource_id=item.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)
    return Response({"results": [_article_payload(item) for item in NewsArticle.objects.order_by("-created_at")[:200]]})

@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def editorial_news_detail(request, pk):
    item = NewsArticle.objects.filter(pk=pk).first()
    if not item: return Response({"detail": "Artigo não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    protected = {"title", "body", "summary", "category", "image_url", "slug"}
    if item.origin == Concurso.Origin.IMPORTED and protected.intersection(request.data): return Response({"detail": "Campos de notícia importada são protegidos contra sincronização."}, status=status.HTTP_409_CONFLICT)
    if item.origin == Concurso.Origin.MANUAL:
        for field in protected:
            if field in request.data: setattr(item, field, str(request.data[field]).strip())
    if "editorial_status" in request.data:
        value=request.data["editorial_status"]
        if value not in NewsArticle.EditorialStatus.values: return Response({"editorial_status": ["Estado inválido."]}, status=status.HTTP_400_BAD_REQUEST)
        if value == NewsArticle.EditorialStatus.SCHEDULED:
            scheduled_for = parse_datetime(str(request.data.get("scheduled_for", "")))
            if not scheduled_for or scheduled_for <= timezone.now(): return Response({"scheduled_for": ["Informe uma data futura para agendar."]}, status=status.HTTP_400_BAD_REQUEST)
            item.scheduled_for = scheduled_for
        elif value == NewsArticle.EditorialStatus.PUBLISHED:
            item.published_at = timezone.now(); item.scheduled_for = None
        item.editorial_status=value; item.is_published=value == NewsArticle.EditorialStatus.PUBLISHED
    before = _article_payload(item)
    item.updated_by=request.user; item.save()
    payload = _article_payload(item)
    audit_log(request, action="article.updated", resource_type="article", resource_id=item.id, before=before, after=payload)
    return Response(payload)
