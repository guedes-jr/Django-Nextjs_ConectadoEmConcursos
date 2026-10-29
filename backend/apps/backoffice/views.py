import csv
from collections.abc import Mapping
import logging
import datetime as dt
import re
import uuid
from io import StringIO
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.sessions.models import Session
from django.db import transaction, DatabaseError
from django.http import HttpResponse
from django.db.models import Avg, Count, F, Max, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.notifications.models import AdminNotification, Notification, NotificationCategory, NotificationPreference, NotificationRecipient
from apps.billing.models import BillingCheckout, PaymentEvent, Plan, Subscription
from .financial_reports import financial_report
from apps.chat.models import ChatUsage, Conversation, Message
from apps.concursos.models import Concurso, EditorialCategory, NewsArticle
from apps.questions import moderation
from apps.questions.moderation import REJECTION_REASONS
from apps.questions.models import Exam, OfficialExamDownload, Question, UserAnswer
from apps.studies.models import StudySession
from apps.core.models import Profile
from apps.core.email_delivery import send_password_reset_link
from apps.workspace.models import (
    CommunityPost,
    ExamSubmission,
    Flashcard,
    SimulationRun,
)

from . import services
from . import diagnostics as diagnostic_tools
from .throttles import DiagnosticsThrottle, DiagnosticRoutineThrottle
from .audit import log as audit_log, redact, snapshot_diff
from .permissions import (
    ROLE_GROUPS, Administrator, EditorialAccess, ReviewAccess,
    SuperuserAccess, diagnostics_allowed, has_role,
)
from .models import AuditEvent, UserManagementMeta
from .serializers import PlanSerializer, SubscriptionAdminSerializer, UserCreateSerializer, StaffCreateSerializer, EditorialConcursoSerializer, EditorialExamSerializer, EditorialArticleSerializer

User = get_user_model()

def _staff_roles(user):
    if user.is_superuser:
        return ["admin"]
    names = set(user.groups.filter(name__in=ROLE_GROUPS.values()).values_list("name", flat=True))
    roles = [role for role, group_name in ROLE_GROUPS.items() if group_name in names]
    return roles


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
        days = int(request.query_params.get("days", 30))
        if not 1 <= days <= 365:
            return None, None, None
        now = timezone.now()
        until_raw = request.query_params.get("until")
        since_raw = request.query_params.get("since")
        until = _parse_report_datetime(until_raw) if until_raw else now
        since = _parse_report_datetime(since_raw) if since_raw else (until - dt.timedelta(days=days)) if until else None
        if since is None or until is None or since >= until or until > now or until - since > dt.timedelta(days=365):
            return None, None, None
        # Also validate the adjacent comparison window against datetime underflow.
        since - (until - since)
        return since, until, max(1, (until - since).days)
    except (TypeError, ValueError, OverflowError):
        return None, None, None


def _audit_payload(item):
    return {
        "id": item.id, "action": item.action, "resource_type": item.resource_type, "resource_id": item.resource_id,
        "actor": {"id": item.actor_id, "username": item.actor.username} if item.actor else None,
        "before": redact(item.before), "after": redact(item.after), "changes": snapshot_diff(item.before, item.after), "context": redact(item.context), "reason": redact(item.reason),
        "ip_address": item.ip_address, "request_id": str(item.request_id) if item.request_id else None,
        "created_at": item.created_at,
    }


@api_view(["GET"])
@permission_classes([SuperuserAccess])
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
            writer.writerow([item.id, timezone.localtime(item.created_at).isoformat(), item.action, item.resource_type, item.resource_id, item.actor.username if item.actor else "sistema", redact(item.reason), item.request_id or ""])
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
    rows = list(queryset[(page - 1) * limit: page * limit])
    audit_log(request, action="audit.viewed", resource_type="audit_event", context={"filters": {"action": request.query_params.get("action", ""), "resource_type": request.query_params.get("resource_type", ""), "since": request.query_params.get("since", ""), "until": request.query_params.get("until", "")}, "page": page})
    return Response({"total": total, "page": page, "limit": limit, "results": [_audit_payload(item) for item in rows]})

def _staff(request):
    return IsAdminUser().has_permission(request, None)


@api_view(["GET"])
@permission_classes([EditorialAccess])
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
@throttle_classes([DiagnosticsThrottle])
def diagnostics_overview(request):
    if not diagnostics_allowed(request.user):
        return _diagnostics_not_found()
    return _diagnostic_response(diagnostic_tools.overview_snapshot())


def _finance_access(user):
    return bool(has_role(user, "admin") and (user.is_superuser or user.has_perm("backoffice.view_financial_reports")))


def _active_user_count(since, until):
    answer_users = UserAnswer.objects.filter(created_at__gte=since, created_at__lt=until).order_by().values_list("user_id", flat=True)
    study_users = StudySession.objects.filter(completed_at__gte=since, completed_at__lt=until).order_by().values_list("block__plan__user_id", flat=True)
    chat_users = ChatUsage.objects.filter(created_at__gte=since, created_at__lt=until).order_by().values_list("user_id", flat=True)
    return answer_users.union(study_users, chat_users).count()


def _percentage_change(current, previous):
    if not previous:
        return None
    return round(((current - previous) / previous) * 100, 1)


def _activity_user_ids(since, until):
    answers = UserAnswer.objects.filter(created_at__gte=since, created_at__lt=until).order_by().values_list("user_id", flat=True)
    studies = StudySession.objects.filter(completed_at__gte=since, completed_at__lt=until).order_by().values_list("block__plan__user_id", flat=True)
    chats = ChatUsage.objects.filter(created_at__gte=since, created_at__lt=until).order_by().values_list("user_id", flat=True)
    return answers.union(studies, chats)


def _cohort_retention(until, days):
    cohort_start = until - dt.timedelta(days=days * 2)
    cohort_end = until - dt.timedelta(days=days)
    cohort = User.objects.filter(date_joined__gte=cohort_start, date_joined__lt=cohort_end)
    total = cohort.count()
    retained = cohort.filter(id__in=_activity_user_ids(cohort_end, until)).count()
    return {"window_days": days, "cohort_size": total, "retained": retained, "rate_percent": round((retained / total) * 100, 1) if total else None}


def _top_values(queryset, *fields, label):
    return [
        {"label": row[label] or "Não informado", "count": row["count"]}
        for row in queryset.values(*fields).annotate(count=Count("id")).order_by("-count", *fields)[:5]
    ]


def _diagnostic_response(data, **kwargs):
    response = Response(data, **kwargs)
    response["Cache-Control"] = "no-store"
    return response


def _diagnostics_not_found():
    return _diagnostic_response({"detail": "Diagnóstico indisponível."}, status=status.HTTP_404_NOT_FOUND)


@api_view(["GET"])
@permission_classes([IsAdminUser])
@throttle_classes([DiagnosticsThrottle])
def diagnostics_services(request):
    if not diagnostics_allowed(request.user):
        return _diagnostics_not_found()
    return _diagnostic_response(diagnostic_tools.service_snapshot())


@api_view(["GET"])
@permission_classes([IsAdminUser])
@throttle_classes([DiagnosticsThrottle])
def diagnostics_database(request):
    if not diagnostics_allowed(request.user):
        return _diagnostics_not_found()
    return _diagnostic_response(diagnostic_tools.database_snapshot())


@api_view(["GET"])
@permission_classes([IsAdminUser])
@throttle_classes([DiagnosticsThrottle])
def diagnostics_logs(request):
    if not diagnostics_allowed(request.user):
        return _diagnostics_not_found()
    serializer = diagnostic_tools.LogQuery(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    query = serializer.validated_data
    files = diagnostic_tools.allowed_logs()
    if not query["service"]:
        audit_log(request, action="diagnostics.logs.listed", resource_type="diagnostic_log")
        return _diagnostic_response({"results": [{key: item[key] for key in ("id", "name", "available")} for item in files],
                         "detail": "Leitura das últimas linhas dentro de uma janela limitada, da mais recente para a mais antiga." if files else "Configure arquivos de log na infraestrutura."})
    item = next((item for item in files if item["id"] == query["service"]), None)
    if item is None or not item["available"]:
        return _diagnostic_response({"detail": "Log indisponível."}, status=status.HTTP_404_NOT_FOUND)
    result = diagnostic_tools.read_log(item, query)
    exported = query["export"] == "txt"
    audit_log(request, action="diagnostics.logs.exported" if exported else "diagnostics.logs.viewed", resource_type="diagnostic_log", resource_id=item["id"],
              context={"page": result["page"], "lines": len(result["lines"]), "bytes_read": result["bytes_read"], "window_limited": result["window_limited"], "export_limited": result["export_limited"],
                       "severity": query["severity"], "has_search": bool(query["q"]), "has_correlation": bool(query["request_id"]),
                       "since": query.get("since"), "until": query.get("until")})
    if exported:
        response = HttpResponse("\n".join(result["lines"]), content_type="text/plain; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="diagnostic-log.txt"'
        response["Cache-Control"] = "no-store"
        response["X-Log-Limited"] = str(result["window_limited"] or result["export_limited"]).lower()
        return response
    response = Response(result)
    response["Cache-Control"] = "no-store"
    return response


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
@throttle_classes([DiagnosticsThrottle, DiagnosticRoutineThrottle])
def diagnostics_scripts(request):
    if not diagnostics_allowed(request.user):
        return _diagnostics_not_found()
    if request.method == "GET":
        return _diagnostic_response({"results": [{"id": key, "title": value["title"], "description": value["description"],
                                     "mode": "read_only", "script_hash": diagnostic_tools.routine_hash(value)} for key, value in diagnostic_tools.ROUTINES.items()],
                         "detail": "Rotinas fixas de leitura, com orçamento de consultas e saída limitada."})
    script_id = request.data.get("script") if isinstance(request.data, Mapping) else None
    if not isinstance(script_id, str) or script_id not in diagnostic_tools.ROUTINES or set(request.data) != {"script"}:
        return _diagnostic_response({"detail": "Informe somente o identificador de uma rotina permitida."}, status=status.HTTP_400_BAD_REQUEST)
    routine = diagnostic_tools.ROUTINES[script_id]
    script_hash = diagnostic_tools.routine_hash(routine)
    try:
        result = diagnostic_tools.run_routine(script_id)
    except Exception as exc:
        try:
            audit_log(request, action="diagnostics.script.failed", resource_type="diagnostic_script", resource_id=script_id,
                      context={"script_hash": script_hash, "error_type": type(exc).__name__, "mode": "read_only"})
        except DatabaseError:
            logging.getLogger(__name__).error("Não foi possível auditar a falha de diagnóstico (%s).", type(exc).__name__)
        return _diagnostic_response({"detail": "A rotina não concluiu dentro dos limites ou o banco está indisponível."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    audit_log(request, action="diagnostics.script.executed", resource_type="diagnostic_script", resource_id=script_id,
              after=result["result"], context={"script_hash": result["script_hash"], "mode": "read_only", "elapsed_ms": result["elapsed_ms"], "truncated": result["truncated"]})
    response = Response(result)
    response["Cache-Control"] = "no-store"
    return response


@api_view(["GET"])
@permission_classes([IsAdminUser])
def business_reports(request):
    since, until, days = _report_period(request)
    if since is None:
        return Response({"detail": "O período informado é inválido."}, status=status.HTTP_400_BAD_REQUEST)
    snapshot_at = timezone.now()
    previous_since = since - (until - since)
    financial_access = _finance_access(request.user)

    current_users = User.objects.filter(date_joined__gte=since, date_joined__lt=until).count()
    previous_users = User.objects.filter(date_joined__gte=previous_since, date_joined__lt=since).count()
    active_users = _active_user_count(since, until)
    active_dau = _active_user_count(until - dt.timedelta(days=1), until)
    active_wau = _active_user_count(until - dt.timedelta(days=7), until)
    active_mau = _active_user_count(until - dt.timedelta(days=30), until)
    signups_with_study = User.objects.filter(date_joined__gte=since, date_joined__lt=until, study_plans__blocks__sessions__completed_at__gte=since, study_plans__blocks__sessions__completed_at__lt=until).distinct().count()
    access_now = Subscription.objects.filter(status=Subscription.Status.ACTIVE).filter(
        Q(current_period_end__gt=snapshot_at) | Q(gateway="local", current_period_end__isnull=True)
    )
    signed_up_with_active_subscription = User.objects.filter(date_joined__gte=since, date_joined__lt=until, id__in=access_now.values("user_id")).count()

    answers = UserAnswer.objects.filter(created_at__gte=since, created_at__lt=until)
    pending_questions = Question.objects.filter(status=Question.Status.PENDING)
    queue_dates = list(pending_questions.order_by("created_at").values_list("created_at", flat=True)[:10000])
    queue_average_age_hours = round(sum((snapshot_at - created).total_seconds() / 3600 for created in queue_dates) / len(queue_dates), 1) if queue_dates else 0
    payments = PaymentEvent.objects.filter(processed=True).annotate(event_time=Coalesce("paid_at", "provider_created_at", "created_at")).filter(event_time__gte=since, event_time__lt=until)
    retention = {str(window): _cohort_retention(until, window) for window in (7, 30, 90)}
    paid_access = access_now.filter(gateway="stripe", currency="brl", price_amount_minor__gt=0, provider_status__in=["active", "past_due"]).exclude(provider_subscription_id="")
    expiring = paid_access.filter(current_period_end__lte=snapshot_at + dt.timedelta(days=7)).count()
    dormant_paid = paid_access.exclude(user_id__in=_activity_user_ids(snapshot_at - dt.timedelta(days=30), snapshot_at)).count()

    payload = {
        "period": {"since": since, "until": until, "days": days, "timezone": timezone.get_current_timezone_name(), "generated_at": snapshot_at},
        "definitions": {
            "active_user": "Usuário com ao menos uma resposta, sessão de estudo ou uso do chat no período.",
            "activation": "Cadastro que concluiu ao menos uma sessão de estudo no mesmo período.",
            "financial": "Receita confirmada dos recibos BRL pela data efetiva do pagamento. MRR/ARR são fotografias atuais de recorrência, independentes do período histórico selecionado.",
            "snapshot": "Fila, assinaturas e risco são fotografias atuais. Conversão cadastro → assinatura ativa verifica acesso vigente agora, incluindo concessões gratuitas; não é conversão histórica paga.",
            "payment_events": "Contagens operacionais usam eventos processados, pela data de pagamento, data no provedor ou data de registro como fallback. Incluem legados e outras moedas; os valores financeiros incluem apenas recibos BRL completos.",
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
            "retention_cohorts": retention,
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
            "users_at_risk": {"expiring_within_7_days": expiring, "paid_without_activity_30_days": dormant_paid, "pending_payment": Subscription.objects.filter(status=Subscription.Status.PENDING).count()},
            "support": {"available": False, "message": "Não existe uma fonte de tickets/suporte integrada."},
        },
    }
    if financial_access:
        payload["financial"] = financial_report(since, until, now=snapshot_at)

    audit_log(request, action="report.viewed", resource_type="business_report", context={"since": since, "until": until, "financial_access": financial_access})
    if request.query_params.get("export") == "csv":
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["indicador", "valor"])
        def write_row(*values):
            writer.writerow([("'" + str(value)) if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")) else value for value in values])
        for key, value in payload["period"].items():
            write_row(f"period.{key}", value)
        for key, value in payload["definitions"].items():
            write_row(f"definitions.{key}", value)
        for section in ("financial", "growth", "product", "operation"):
            for key, value in payload[section].items():
                if not isinstance(value, (dict, list)):
                    write_row(f"{section}.{key}", value)
        if financial_access:
            for key, value in payload["financial"]["definitions"].items():
                write_row(f"financial.definitions.{key}", value)
            for group in ("revenue_by_plan_cycle", "daily_revenue", "plan_distribution"):
                for index, row in enumerate(payload["financial"][group]):
                    for key, value in row.items():
                        write_row(f"financial.{group}.{index}.{key}", value)
        audit_log(request, action="report.exported", resource_type="business_report", context={"since": since, "until": until, "financial_access": financial_access})
        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = "attachment; filename=relatorio-negocio.csv"
        response["Cache-Control"] = "no-store"
        return response
    response = Response(payload)
    response["Cache-Control"] = "no-store"
    return response

@api_view(["GET"])
@permission_classes([Administrator])
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


def _user_activity_at(user_id):
    values = [
        UserAnswer.objects.filter(user_id=user_id).aggregate(value=Max("created_at"))["value"],
        StudySession.objects.filter(block__plan__user_id=user_id).aggregate(value=Max("completed_at"))["value"],
        SimulationRun.objects.filter(user_id=user_id).aggregate(value=Max("created_at"))["value"],
        Notification.objects.filter(user_id=user_id).aggregate(value=Max("created_at"))["value"],
    ]
    return max((value for value in values if value), default=None)


def _user_payload(user, request=None, include_detail=False):
    sub = getattr(user, "subscription", None)
    meta, _ = UserManagementMeta.objects.get_or_create(user=user)
    profile, _ = Profile.objects.get_or_create(user=user)
    activity_at = _user_activity_at(user.id)
    avatar = profile.avatar.url if profile.avatar else None
    if avatar and request:
        avatar = request.build_absolute_uri(avatar)
    payload = {
        "id": user.id, "username": user.username, "email": user.email,
        "first_name": user.first_name, "last_name": user.last_name, "avatar": avatar,
        "is_staff": user.is_staff, "is_active": user.is_active,
        "date_joined": user.date_joined.isoformat(), "last_login": user.last_login.isoformat() if user.last_login else None,
        "last_activity_at": activity_at.isoformat() if activity_at else None,
        "tags": meta.tags, "block_reason": meta.block_reason,
        "subscription": {"id": sub.id, "plan": sub.plan.name, "plan_slug": sub.plan.slug, "status": sub.status, "cycle": sub.cycle, "current_period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None} if sub else None,
    }
    if include_detail:
        payload.update({
            "profile": {field: getattr(profile, field) for field in ("phone", "state", "city", "profession", "target_role", "study_hours_per_day", "disciplines", "is_public", "show_in_ranking")},
            "preferences": {item.category: item.enabled for item in NotificationPreference.objects.filter(user=user)},
            "terms": {"accepted": None, "detail": "O aceite histórico não foi registrado para este cadastro."},
            "internal_notes": meta.internal_notes,
            "risk": {"inactive_30_days": not activity_at or activity_at < timezone.now() - dt.timedelta(days=30), "subscription_expiring": bool(sub and sub.current_period_end and sub.current_period_end <= timezone.now() + dt.timedelta(days=7))},
        })
    return payload


def _users_with_recent_activity(cutoff):
    return User.objects.filter(
        Q(pk__in=UserAnswer.objects.filter(created_at__gte=cutoff).values("user_id")) |
        Q(pk__in=StudySession.objects.filter(completed_at__gte=cutoff).values("block__plan__user_id")) |
        Q(pk__in=SimulationRun.objects.filter(created_at__gte=cutoff).values("user_id")) |
        Q(pk__in=Notification.objects.filter(created_at__gte=cutoff).values("user_id"))
    ).values("pk")


@api_view(["GET"])
@permission_classes([Administrator])
def users_overview(request):
    cutoff = timezone.now() - dt.timedelta(days=30)
    summary = User.objects.aggregate(total=Count("id"), active=Count("id", filter=Q(is_active=True)),
                                    blocked=Count("id", filter=Q(is_active=False)),
                                    new_30_days=Count("id", filter=Q(date_joined__gte=cutoff)))
    summary["valid_subscriptions"] = Subscription.objects.filter(status=Subscription.Status.ACTIVE).filter(
        Q(current_period_end__isnull=True) | Q(current_period_end__gt=timezone.now())
    ).count()
    return Response(summary)


@api_view(["GET", "POST"])
@permission_classes([Administrator])
def list_users(request):
    if request.method == "POST":
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            payload = _user_payload(user, request)
            audit_log(request, action="user.created", resource_type="user", resource_id=user.id,
                      after={key: payload[key] for key in ("username", "email", "is_staff", "is_active")})
        return Response(payload, status=status.HTTP_201_CREATED)
    search = request.query_params.get("search", "").strip()
    try:
        limit = min(100, max(1, int(request.query_params.get("page_size", request.query_params.get("limit", 50)))))
        offset = max(0, int(request.query_params.get("offset", 0)))
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        return Response({"detail": "Paginação inválida."}, status=status.HTTP_400_BAD_REQUEST)
    qs = User.objects.select_related("subscription__plan", "profile", "management_meta").all()
    if search:
        qs = qs.filter(Q(username__icontains=search) | Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))
    if request.query_params.get("status") == "active": qs = qs.filter(is_active=True)
    if request.query_params.get("status") == "blocked": qs = qs.filter(is_active=False)
    if plan := request.query_params.get("plan"): qs = qs.filter(subscription__plan__slug=plan)
    subscription = request.query_params.get("subscription")
    if subscription == "valid":
        qs = qs.filter(subscription__status=Subscription.Status.ACTIVE).filter(Q(subscription__current_period_end__isnull=True) | Q(subscription__current_period_end__gt=timezone.now()))
    elif subscription == "none": qs = qs.filter(subscription__isnull=True)
    elif subscription: qs = qs.filter(subscription__status=subscription)
    if registered_from := parse_datetime(request.query_params.get("registered_from", "")): qs = qs.filter(date_joined__gte=registered_from)
    if registered_to := parse_datetime(request.query_params.get("registered_to", "")): qs = qs.filter(date_joined__lte=registered_to)
    cutoff = timezone.now() - dt.timedelta(days=30)
    if request.query_params.get("registered") == "recent": qs = qs.filter(date_joined__gte=cutoff)
    activity = request.query_params.get("activity")
    if activity == "active": qs = qs.filter(pk__in=_users_with_recent_activity(cutoff))
    elif activity == "inactive": qs = qs.exclude(pk__in=_users_with_recent_activity(cutoff))
    orderings = {"-date_joined": ("-date_joined", "-id"), "date_joined": ("date_joined", "id"), "name": ("username", "id"), "-last_login": ("-last_login", "-id")}
    qs = qs.order_by(*orderings.get(request.query_params.get("ordering"), orderings["-date_joined"]))
    total = qs.count()
    if "page" in request.query_params:
        page = min(page, max(1, (total + limit - 1) // limit))
        offset = (page - 1) * limit
    rows = [_user_payload(user, request) for user in qs[offset:offset + limit]]
    return Response({"results": rows, "total": total, "offset": offset, "limit": limit, "page": page})


@api_view(["GET", "PATCH"])
@permission_classes([Administrator])
def update_user(request, pk):
    user = User.objects.select_related("subscription__plan", "profile", "management_meta").filter(pk=pk).first()
    if not user: return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "GET": return Response(_user_payload(user, request, include_detail=True))
    before = _user_payload(user, request, include_detail=True)
    data = request.data
    profile, _ = Profile.objects.get_or_create(user=user)
    meta, _ = UserManagementMeta.objects.get_or_create(user=user)
    errors = {}
    if "email" in data:
        email = str(data["email"]).strip().lower()
        if not email or User.objects.exclude(pk=user.pk).filter(email__iexact=email).exists(): errors["email"] = "Informe um e-mail único e válido."
        else: user.email = email
    for field in ("first_name", "last_name"):
        if field in data: setattr(user, field, str(data[field]).strip()[:150])
    if "is_active" in data:
        if not isinstance(data["is_active"], bool): errors["is_active"] = "Informe um estado de acesso válido."
        else:
            user.is_active = data["is_active"]
            if user.is_active: meta.block_reason = ""
    for field in ("phone", "state", "city", "profession", "target_role", "study_hours_per_day", "disciplines", "is_public", "show_in_ranking"):
        if field in data: setattr(profile, field, data[field])
    if "tags" in data:
        if not isinstance(data["tags"], list) or any(not isinstance(x, str) or len(x) > 40 for x in data["tags"]): errors["tags"] = "Use etiquetas de até 40 caracteres."
        else: meta.tags = sorted(set(x.strip() for x in data["tags"] if x.strip()))[:20]
    if "internal_notes" in data: meta.internal_notes = str(data["internal_notes"])[:5000]
    if errors: return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        user.save(); profile.save(); meta.updated_by = request.user; meta.save()
    audit_log(request, action="user.updated", resource_type="user", resource_id=user.id, before=before, after=_user_payload(user, request, include_detail=True))
    return Response(_user_payload(user, request, include_detail=True))


@api_view(["GET"])
@permission_classes([Administrator])
def user_history(request, pk):
    user = User.objects.filter(pk=pk).first()
    if not user: return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    def rows(qs, fields, order_by="-created_at"): return [{key: (value.isoformat() if hasattr(value, "isoformat") else value) for key, value in zip(fields, row)} for row in qs.values_list(*fields).order_by(order_by)[:20]]
    return Response({
        "access": [{"at": event.created_at, "action": event.action, "reason": event.reason} for event in AuditEvent.objects.filter(resource_type="user", resource_id=str(user.id))[:30]],
        "studies": rows(StudySession.objects.filter(block__plan__user=user), ("block__date", "minutes", "completed_at"), "-completed_at"),
        "questions": rows(UserAnswer.objects.filter(user=user), ("created_at", "is_correct")),
        "simulations": rows(SimulationRun.objects.filter(user=user), ("created_at", "score")),
        "payments": rows(PaymentEvent.objects.filter(user=user), ("created_at", "type", "processed")),
        "notifications": rows(Notification.objects.filter(user=user), ("created_at", "title", "is_read")),
    })


@api_view(["POST"])
@permission_classes([Administrator])
def user_action(request, pk):
    user = User.objects.filter(pk=pk).first()
    if not user: return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    action = str(request.data.get("action", "")); reason = str(request.data.get("reason", "")).strip()[:500]
    meta, _ = UserManagementMeta.objects.get_or_create(user=user)
    if action == "block":
        if not reason: return Response({"reason": "Informe o motivo do bloqueio."}, status=status.HTTP_400_BAD_REQUEST)
        user.is_active = False; user.save(update_fields=["is_active"]); meta.block_reason = reason; meta.updated_by = request.user; meta.save()
    elif action == "unblock":
        user.is_active = True; user.save(update_fields=["is_active"]); meta.block_reason = ""; meta.updated_by = request.user; meta.save()
    elif action == "password_reset":
        if not user.email: return Response({"detail": "O usuário não possui e-mail cadastrado."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            send_password_reset_link(user)
        except Exception:
            logging.getLogger(__name__).exception("Falha ao enviar redefinição de senha do usuário %s.", user.pk)
            return Response({"detail": "Não foi possível enviar o e-mail. Revise a configuração SMTP."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    elif action == "verify_email":
        from allauth.account.models import EmailAddress
        EmailAddress.objects.update_or_create(user=user, email=user.email, defaults={"verified": True, "primary": True})
    elif action == "logout_all":
        removed = 0
        for session in Session.objects.all():
            try:
                if str(session.get_decoded().get("_auth_user_id")) == str(user.id): session.delete(); removed += 1
            except Exception: continue
    else: return Response({"detail": "Ação não permitida."}, status=status.HTTP_400_BAD_REQUEST)
    audit_log(request, action=f"user.{action}", resource_type="user", resource_id=user.id, reason=reason, after={"is_active": user.is_active})
    return Response({"ok": True, "user": _user_payload(user, request, include_detail=True)})


@api_view(["POST"])
@permission_classes([Administrator])
def user_notification(request, pk):
    user = User.objects.filter(pk=pk, is_active=True).first()
    if not user: return Response({"detail": "Usuário ativo não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    title, body = str(request.data.get("title", "")).strip(), str(request.data.get("body", "")).strip()
    category = str(request.data.get("category", NotificationCategory.FEEDBACK))
    if not title or len(title) > 120: return Response({"title": "Informe um título de até 120 caracteres."}, status=status.HTTP_400_BAD_REQUEST)
    if category not in NotificationCategory.values: return Response({"category": "Categoria inválida."}, status=status.HTTP_400_BAD_REQUEST)
    item = Notification.objects.create(user=user, actor=request.user, category=category, title=title, body=body[:2000], link=str(request.data.get("link", ""))[:255])
    audit_log(request, action="user.notification_sent", resource_type="user", resource_id=user.id, after={"notification_id": item.id, "category": category})
    return Response({"id": item.id, "created_at": item.created_at}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([Administrator])
@transaction.atomic
def assign_subscription(request, pk):
    user = User.objects.select_for_update().filter(pk=pk).first()
    if not user: return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    plan = Plan.objects.filter(slug=request.data.get("plan", "")).first()
    if not plan: return Response({"detail": "Plano inválido."}, status=status.HTTP_400_BAD_REQUEST)
    cycle = request.data.get("cycle", Subscription.Cycle.MONTHLY)
    if cycle not in Subscription.Cycle.values: return Response({"cycle": "Ciclo inválido."}, status=status.HTTP_400_BAD_REQUEST)
    status_ = request.data.get("status", Subscription.Status.ACTIVE if plan.monthly_price == 0 else Subscription.Status.PENDING)
    if status_ not in Subscription.Status.values: return Response({"status": "Status inválido."}, status=status.HTTP_400_BAD_REQUEST)
    period_end = parse_datetime(request.data.get("current_period_end", "")) if request.data.get("current_period_end") else None
    if Subscription.objects.filter(user=user, gateway="stripe").exists() or BillingCheckout.objects.filter(user=user, status__in=["creating", "open", "processing"]).exists():
        return Response({"detail": "Assinatura gerenciada pelo provedor; use o fluxo de cobrança."}, status=409)
    sub, _ = Subscription.objects.update_or_create(user=user, defaults={"plan": plan, "cycle": cycle, "status": status_, "current_period_end": period_end})
    payload = {"id": sub.id, "status": sub.status, "plan": plan.name, "current_period_end": sub.current_period_end}
    audit_log(request, action="subscription.assigned", resource_type="subscription", resource_id=sub.id, after=payload)
    return Response(payload)


@api_view(["GET"])
@permission_classes([Administrator])
def subscriptions_overview(request):
    now = timezone.now()
    active = Subscription.objects.filter(status=Subscription.Status.ACTIVE).filter(Q(current_period_end__isnull=True) | Q(current_period_end__gt=now))
    expiring = active.filter(current_period_end__lte=now + dt.timedelta(days=30)).count()
    mrr = Decimal(0)
    finance_access = _finance_access(request.user)
    if finance_access:
        for sub in active.select_related("plan"):
            if sub.currency.lower() != "brl": continue
            amount = Decimal(sub.price_amount_minor) / 100 if sub.price_amount_minor is not None else {"mensal": sub.plan.monthly_price, "semestral": sub.plan.semiannual_price, "anual": sub.plan.annual_price}[sub.cycle]
            mrr += amount / {"mensal": 1, "semestral": 6, "anual": 12}[sub.cycle]
    return Response({"total": Subscription.objects.count(), "active": active.count(), "pending": Subscription.objects.filter(status=Subscription.Status.PENDING).count(), "canceled": Subscription.objects.filter(status=Subscription.Status.CANCELED).count(), "expiring_30_days": expiring, "mrr_estimated": f"{mrr:.2f}" if finance_access else None})


@api_view(["GET"])
@permission_classes([Administrator])
def list_subscriptions(request):
    qs = Subscription.objects.select_related("user", "plan")
    status_filter = request.query_params.get("status", "").strip()
    now = timezone.now()
    if status_filter == "valid":
        qs = qs.filter(status=Subscription.Status.ACTIVE).filter(Q(current_period_end__isnull=True) | Q(current_period_end__gt=now))
    elif status_filter: qs = qs.filter(status=status_filter)
    if plan_filter := request.query_params.get("plan", "").strip(): qs = qs.filter(plan__slug=plan_filter)
    if cycle_filter := request.query_params.get("cycle", "").strip(): qs = qs.filter(cycle=cycle_filter)
    try:
        if request.query_params.get("expires_within"):
            days = int(request.query_params["expires_within"])
            if days < 0 or days > 365: raise ValueError()
            qs = qs.filter(status=Subscription.Status.ACTIVE, current_period_end__gt=now, current_period_end__lte=now + dt.timedelta(days=days))
        size = max(1, min(100, int(request.query_params.get("page_size", 12))))
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        return Response({"detail": "Informe filtros de vencimento e paginação válidos."}, status=400)
    if request.query_params.get("expired") == "true": qs = qs.filter(status=Subscription.Status.ACTIVE, current_period_end__lte=now)
    if search := request.query_params.get("search", "").strip():
        qs = qs.filter(Q(user__username__icontains=search) | Q(user__email__icontains=search) | Q(user__first_name__icontains=search) | Q(user__last_name__icontains=search))
    orderings = {"-created_at": ("-created_at", "-id"), "created_at": ("created_at", "id"), "name": ("user__username", "id"), "expires": (F("current_period_end").asc(nulls_last=True), "id")}
    qs = qs.order_by(*orderings.get(request.query_params.get("ordering"), orderings["-created_at"]))
    count = qs.count()
    page = min(page, max(1, (count + size - 1) // size))
    results = qs[(page - 1) * size:page * size] if "page" in request.query_params else qs[:200]
    return Response({"results": SubscriptionAdminSerializer(results, many=True).data, "count": count, "page": page})


@api_view(["PATCH"])
@permission_classes([Administrator])
@transaction.atomic
def update_subscription(request, pk):
    try:
        sub = Subscription.objects.get(pk=pk)
    except Subscription.DoesNotExist:
        return Response(
            {"detail": "Assinatura não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )
    User.objects.select_for_update().get(pk=sub.user_id)
    sub.refresh_from_db()
    if sub.gateway == "stripe" or BillingCheckout.objects.filter(user_id=sub.user_id, status__in=["creating", "open", "processing"]).exists():
        return Response({"detail": "Assinatura gerenciada pelo provedor; use o fluxo de cobrança."}, status=409)
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
    if "current_period_end" in data:
        value = data["current_period_end"]
        parsed = parse_datetime(value) if isinstance(value, str) and value else value
        if value and not parsed: return Response({"current_period_end": "Informe uma data de vencimento válida."}, status=status.HTTP_400_BAD_REQUEST)
        sub.current_period_end = parsed
    sub.save()
    payload = SubscriptionAdminSerializer(sub).data
    audit_log(request, action="subscription.updated", resource_type="subscription", resource_id=sub.id, before=before, after={"plan": sub.plan.slug, "cycle": sub.cycle, "status": sub.status})
    return Response(payload)


@api_view(["GET"])
@permission_classes([Administrator])
def plans_overview(request):
    valid_active = Q(subscription__status=Subscription.Status.ACTIVE) & (
        Q(subscription__current_period_end__isnull=True) | Q(subscription__current_period_end__gt=timezone.now())
    )
    plans_qs = Plan.objects.annotate(
        subscribers_total=Count("subscription"),
        subscribers_active=Count("subscription", filter=valid_active),
        subscribers_pending=Count("subscription", filter=Q(subscription__status=Subscription.Status.PENDING)),
        subscribers_canceled=Count("subscription", filter=Q(subscription__status=Subscription.Status.CANCELED)),
    ).order_by("sort_order", "name")
    finance_access = _finance_access(request.user)
    cycle_divisor = {"mensal": 1, "semestral": 6, "anual": 12}
    mrr_by_plan = {}
    if finance_access:
        subscriptions = Subscription.objects.filter(status=Subscription.Status.ACTIVE).filter(
            Q(current_period_end__isnull=True) | Q(current_period_end__gt=timezone.now())
        ).select_related("plan")
        for sub in subscriptions:
            if sub.currency.lower() != "brl":
                continue
            amount = (Decimal(sub.price_amount_minor) / 100 if sub.price_amount_minor is not None else
                      {"mensal": sub.plan.monthly_price, "semestral": sub.plan.semiannual_price, "anual": sub.plan.annual_price}[sub.cycle])
            mrr_by_plan[sub.plan_id] = mrr_by_plan.get(sub.plan_id, Decimal(0)) + amount / cycle_divisor[sub.cycle]
    items = []
    for item in plans_qs:
        items.append({"id": item.id, "subscribers_total": item.subscribers_total,
                      "subscribers_active": item.subscribers_active, "subscribers_pending": item.subscribers_pending,
                      "subscribers_canceled": item.subscribers_canceled,
                      "mrr_estimated": f"{mrr_by_plan.get(item.id, Decimal(0)):.2f}" if finance_access else None,
                      "retention_rate": round(item.subscribers_active / item.subscribers_total * 100, 1) if item.subscribers_total else None})
    return Response({"total": len(items), "published": sum(p.status == Plan.Status.PUBLISHED for p in plans_qs),
                     "draft": sum(p.status == Plan.Status.DRAFT for p in plans_qs),
                     "archived": sum(p.status == Plan.Status.ARCHIVED for p in plans_qs),
                     "mrr_estimated": f"{sum(mrr_by_plan.values(), Decimal(0)):.2f}" if finance_access else None,
                     "plans": items})


@api_view(["POST"])
@permission_classes([Administrator])
def plans_bulk(request):
    ids = request.data.get("ids", [])
    action = request.data.get("action", "")
    if not isinstance(ids, list) or not ids or not all(str(value).isdigit() for value in ids):
        return Response({"detail": "Selecione ao menos um plano válido."}, status=status.HTTP_400_BAD_REQUEST)
    if action not in {"publish", "draft", "archive", "activate", "deactivate"}:
        return Response({"detail": "Ação em massa inválida."}, status=status.HTTP_400_BAD_REQUEST)
    queryset = Plan.objects.filter(id__in=ids)
    if queryset.count() != len(set(map(int, ids))):
        return Response({"detail": "Um ou mais planos não foram encontrados."}, status=status.HTTP_404_NOT_FOUND)
    values = {"status": {"publish": Plan.Status.PUBLISHED, "draft": Plan.Status.DRAFT, "archive": Plan.Status.ARCHIVED}.get(action)} if action in {"publish", "draft", "archive"} else {"is_active": action == "activate"}
    if action in {"draft", "archive"}:
        values["is_active"] = False
    if action == "activate" and queryset.exclude(status=Plan.Status.PUBLISHED).exists():
        return Response({"detail": "Publique os planos antes de liberar a venda."}, status=status.HTTP_400_BAD_REQUEST)
    changed = queryset.update(**values)
    audit_log(request, action="plan.bulk_updated", resource_type="plan", context={"ids": ids, "action": action, "changed": changed})
    return Response({"updated": changed})


@api_view(["POST"])
@permission_classes([Administrator])
def plan_duplicate(request, pk):
    plan = Plan.objects.filter(pk=pk).first()
    if not plan:
        return Response({"detail": "Plano não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    base_slug = re.sub(r"[^a-z0-9-]", "-", f"{plan.slug}-copia".lower()).strip("-")[:45] or "plano-copia"
    slug, suffix = base_slug, 2
    while Plan.objects.filter(slug=slug).exists():
        slug = f"{base_slug[:40]}-{suffix}"
        suffix += 1
    clone = Plan.objects.create(slug=slug, name=f"{plan.name} (cópia)", description=plan.description, monthly_price=plan.monthly_price, semiannual_price=plan.semiannual_price, annual_price=plan.annual_price, features=plan.features, status=Plan.Status.DRAFT, is_highlighted=False, trial_days=plan.trial_days, is_active=False, sort_order=plan.sort_order + 1)
    payload = PlanSerializer(clone).data
    audit_log(request, action="plan.duplicated", resource_type="plan", resource_id=clone.id, after=payload, context={"source_plan_id": plan.id})
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([Administrator])
def plans(request):
    if request.method == "POST":
        ser = PlanSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        plan = ser.save()
        audit_log(request, action="plan.created", resource_type="plan", resource_id=plan.id, after=ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)
    qs = Plan.objects.order_by("sort_order", "name")
    query = request.query_params.get("q", "").strip()
    plan_status = request.query_params.get("status", "").strip()
    if plan_status:
        qs = qs.filter(status=plan_status)
    active = request.query_params.get("active", "").strip()
    if active in {"true", "false"}:
        qs = qs.filter(is_active=active == "true")
    try:
        price_min = request.query_params.get("price_min")
        price_max = request.query_params.get("price_max")
        if price_min:
            value = Decimal(price_min)
            if not value.is_finite() or value < 0: raise ValueError()
            qs = qs.filter(monthly_price__gte=value)
        if price_max:
            value = Decimal(price_max)
            if not value.is_finite() or value < 0: raise ValueError()
            qs = qs.filter(monthly_price__lte=value)
    except (TypeError, ValueError, InvalidOperation):
        return Response({"detail": "Faixa de preço inválida."}, status=status.HTTP_400_BAD_REQUEST)
    ordering = request.query_params.get("ordering", "default")
    orderings = {"default": ("sort_order", "name", "id"), "name": ("name", "id"), "price": ("monthly_price", "id"), "-price": ("-monthly_price", "id")}
    qs = qs.order_by(*orderings.get(ordering, orderings["default"]))
    results = PlanSerializer(qs, many=True).data
    # JSONField string lookups differ between SQLite and PostgreSQL. Benefits are
    # filtered in Python to keep the administrative search portable.
    if query:
        normalized_query = query.casefold()
        results = [item for item in results if normalized_query in item["name"].casefold() or normalized_query in item["slug"].casefold() or any(normalized_query in str(feature).casefold() for feature in item.get("features", []))]
    count = len(results)
    if "page" in request.query_params:
        try:
            page = max(1, int(request.query_params["page"]))
            page_size = max(1, min(100, int(request.query_params.get("page_size", 12))))
        except (TypeError, ValueError):
            return Response({"detail": "Paginação inválida."}, status=status.HTTP_400_BAD_REQUEST)
        page = min(page, max(1, (count + page_size - 1) // page_size))
        results = results[(page - 1) * page_size:page * page_size]
        return Response({"results": results, "count": count, "page": page, "page_size": page_size})
    return Response({"results": results, "count": count})


@api_view(["PATCH", "DELETE"])
@permission_classes([Administrator])
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
@permission_classes([EditorialAccess])
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


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([ReviewAccess])
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

    pk = request.data.get("id")
    try:
        question = Question.objects.select_related("source").get(pk=pk)
    except Question.DoesNotExist:
        return Response(
            {"detail": "Questão não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )

    if request.method == "DELETE":
        before = {"status": question.status, "source": question.source.slug if question.source else None, "banca": question.banca, "discipline": question.discipline, "year": question.year}
        question_id = question.id
        question.delete()
        audit_log(request, action="question.deleted", resource_type="question", resource_id=question_id, before=before)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — todas as escritas passam pelo moderation.py
    mod_action = request.data.get("action", "").strip()

    if mod_action in {"unpublish", "publish"}:
        if mod_action == "unpublish" and question.status != Question.Status.APPROVED:
            return Response({"detail": "Somente questões em produção podem ser retiradas."}, status=status.HTTP_409_CONFLICT)
        if mod_action == "publish" and question.status != Question.Status.DRAFT:
            return Response({"detail": "Somente rascunhos podem voltar para produção."}, status=status.HTTP_409_CONFLICT)
        before = {"status": question.status}
        question.status = Question.Status.DRAFT if mod_action == "unpublish" else Question.Status.APPROVED
        if mod_action == "publish":
            question.reviewed_by = request.user
            question.reviewed_at = timezone.now()
        question.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])
        audit_log(request, action=f"question.{mod_action}ed", resource_type="question", resource_id=question.id, before=before, after={"status": question.status}, context={"source": question.source.slug if question.source else None})
        return Response({"id": question.id, "status": question.status})

    if mod_action == "approve":
        explanation = request.data.get("explanation")
        try:
            moderation.approve(question, request.user, explanation, request=request)
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
            moderation.reject(question, request.user, reason, reason_code, request=request)
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

    if mod_action == "edit_content":
        if question.status != Question.Status.APPROVED:
            return Response({"detail": "A edição direta é permitida apenas para questões em produção."}, status=status.HTTP_409_CONFLICT)
        fields = {name: request.data.get(name) for name in ("statement", "banca", "discipline", "year", "options", "correct_answer", "explanation")}
        errors = {}
        if not isinstance(fields["statement"], str) or not fields["statement"].strip(): errors["statement"] = "Informe o enunciado."
        if not isinstance(fields["banca"], str) or not fields["banca"].strip(): errors["banca"] = "Informe a banca."
        if not isinstance(fields["discipline"], str) or not fields["discipline"].strip(): errors["discipline"] = "Informe a disciplina."
        if not isinstance(fields["options"], list) or len(fields["options"]) < 2 or any(not isinstance(value, str) or not value.strip() for value in fields["options"]): errors["options"] = "Informe ao menos duas alternativas."
        if not isinstance(fields["correct_answer"], int) or not isinstance(fields["options"], list) or fields["correct_answer"] < 0 or fields["correct_answer"] >= len(fields["options"]): errors["correct_answer"] = "Selecione uma alternativa correta válida."
        if errors: return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        before = {name: getattr(question, name) for name in fields}
        for name, value in fields.items(): setattr(question, name, value.strip() if isinstance(value, str) else value)
        question.content_hash = ""
        question.save()
        audit_log(request, action="question.content_edited", resource_type="question", resource_id=question.id, before=before, after={name: getattr(question, name) for name in fields}, context={"source": question.source.slug if question.source else None})
        return Response({"id": question.id, "status": question.status})

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
@permission_classes([EditorialAccess])
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
@permission_classes([Administrator])
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
@permission_classes([EditorialAccess])
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
@permission_classes([Administrator])
def backups(request):
    if request.method == "POST":
        try:
            name = services.create_backup(request=request)
        except (ValueError, OSError):
            return Response({"detail": "Backup não concluído. Verifique configuração, utilitários e espaço no servidor."}, status=503)
        return Response({"name": name}, status=status.HTTP_201_CREATED)
    return Response({"results": services.list_backups(), "restore_via_web": settings.DATABASES["default"]["ENGINE"].endswith(".sqlite3")})


@api_view(["POST"])
@permission_classes([Administrator])
def restore(request, name):
    try:
        result = services.restore_backup(name, request=request)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result)


@api_view(["GET"])
@permission_classes([Administrator])
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
@permission_classes([Administrator])
def staff(request):
    denied = _superuser_only(request)
    if denied:
        return denied
    if request.method == "POST":
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = request.data.get("role", "reviewer")
        if not isinstance(role, str) or role not in ROLE_GROUPS or not Group.objects.filter(name=ROLE_GROUPS[role]).exists():
            return Response({"detail": "Papel administrativo inválido."}, status=400)
        with transaction.atomic():
            user = serializer.save()
            user.is_staff = True
            user.save(update_fields=["is_staff"])
            _set_staff_role(user, role)
        payload = _staff_payload(user)
        audit_log(request, action="staff.created", resource_type="user", resource_id=user.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)

    qs = User.objects.filter(is_staff=True)
    summary = qs.aggregate(total=Count("id"), active=Count("id", filter=Q(is_active=True)),
                           inactive=Count("id", filter=Q(is_active=False)), superuser=Count("id", filter=Q(is_superuser=True)))
    for role, group in ROLE_GROUPS.items():
        summary[role] = qs.filter(is_superuser=False, groups__name=group).count()
    if search := request.query_params.get("search", "").strip():
        qs = qs.filter(Q(username__icontains=search) | Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))
    if request.query_params.get("status") in {"active", "inactive"}: qs = qs.filter(is_active=request.query_params["status"] == "active")
    role = request.query_params.get("role", "")
    if role == "superuser": qs = qs.filter(is_superuser=True)
    elif role in ROLE_GROUPS: qs = qs.filter(is_superuser=False, groups__name=ROLE_GROUPS[role])
    ordering = {"name": ("username", "id"), "-date_joined": ("-date_joined", "-id"), "-last_login": (F("last_login").desc(nulls_last=True), "id")}
    qs = qs.order_by(*ordering.get(request.query_params.get("ordering"), ordering["name"]))
    count = qs.count()
    try:
        page_size = min(100, max(1, int(request.query_params.get("page_size", 12))))
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        return Response({"detail": "Paginação inválida."}, status=400)
    page = min(page, max(1, (count + page_size - 1) // page_size))
    if "page" in request.query_params: qs = qs[(page - 1) * page_size:page * page_size]
    return Response({"results": [_staff_payload(u) for u in qs], "count": count, "page": page, "overview": summary})


@api_view(["PATCH"])
@permission_classes([Administrator])
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
    for field in ("is_staff", "is_active"):
        if field in data and not isinstance(data[field], bool):
            return Response({field: "Informe verdadeiro ou falso."}, status=400)

    before = _staff_payload(user)
    if user.pk == request.user.pk and (("is_staff" in data and data["is_staff"] is not True) or ("is_active" in data and data["is_active"] is not True)):
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


def _editorial_list_response(request, queryset, payload, overview):
    count = queryset.count()
    try:
        page_size = min(100, max(1, int(request.query_params.get("page_size", 12))))
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        return Response({"detail": "Paginação inválida."}, status=400)
    page = min(page, max(1, (count + page_size - 1) // page_size))
    rows = queryset[(page - 1) * page_size:page * page_size] if "page" in request.query_params else queryset[:200]
    return Response({"results": [payload(item) for item in rows], "count": count, "page": page, "overview": overview,
                     "can_manage": has_role(request.user, "admin", "editor")})


def _editorial_concurso_payload(item):
    return {"id": item.id, "title": item.title, "organization": item.organization, "state": item.state,
            "status": item.status, "deadline": item.deadline, "source_url": item.source_url,
            "official_url": item.official_url, "description": item.description, "materials_count": item.resources.count(),
            "origin": item.origin, "editorial_status": item.editorial_status, "banca": item.banca_id, "banca_name": item.banca.name if item.banca_id else None,
            "exams_count": item.exams.count(), "updated_at": item.fetched_at}


@api_view(["GET", "POST"])
@permission_classes([EditorialAccess])
def editorial_concursos(request):
    if request.method == "POST":
        serializer = EditorialConcursoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save(source="manual", external_id=f"manual:{uuid.uuid4()}", origin=Concurso.Origin.MANUAL,
                               created_by=request.user, updated_by=request.user)
        payload = _editorial_concurso_payload(item)
        audit_log(request, action="concurso.created", resource_type="concurso", resource_id=item.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)
    qs = Concurso.objects.select_related("banca").prefetch_related("exams", "resources")
    if request.query_params.get("options") == "1":
        return Response({"results": list(qs.order_by("title", "id").values("id", "title"))})
    overview = qs.aggregate(total=Count("id"), manual=Count("id", filter=Q(origin="manual")),
                            imported=Count("id", filter=Q(origin="imported")), published=Count("id", filter=Q(editorial_status="published")),
                            archived=Count("id", filter=Q(editorial_status="archived")))
    for key in ("origin", "editorial_status", "status"):
        if value := request.query_params.get(key): qs = qs.filter(**{key: value})
    if banca := request.query_params.get("banca"):
        if not banca.isdigit(): return Response({"banca": ["Banca inválida."]}, status=400)
        qs = qs.filter(banca_id=int(banca))
    if state := request.query_params.get("state", "").strip(): qs = qs.filter(state__iexact=state)
    if search := request.query_params.get("search", "").strip():
        qs = qs.filter(Q(title__icontains=search) | Q(organization__icontains=search))
    orderings = {"recent": ("-fetched_at", "-id"), "name": ("title", "id"), "-name": ("-title", "id")}
    qs = qs.order_by(*orderings.get(request.query_params.get("ordering"), orderings["recent"]))
    return _editorial_list_response(request, qs, _editorial_concurso_payload, overview)


@api_view(["PATCH"])
@permission_classes([EditorialAccess])
def editorial_concurso_detail(request, pk):
    item = Concurso.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "Concurso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.origin == Concurso.Origin.IMPORTED and any(key in request.data for key in ("title", "organization", "state", "status", "source_url")):
        return Response({"detail": "Campos de concursos importados são protegidos contra a sincronização."}, status=status.HTTP_409_CONFLICT)
    before = _editorial_concurso_payload(item)
    serializer = EditorialConcursoSerializer(item, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    item = serializer.save(updated_by=request.user)
    payload = _editorial_concurso_payload(item)
    audit_log(request, action="concurso.updated", resource_type="concurso", resource_id=item.id, before=before, after=payload)
    return Response(payload)


def _editorial_exam_payload(item):
    return {"id": item.id, "title": item.title, "banca": item.banca, "institution": item.institution,
            "role": item.role, "year": item.year, "is_published": item.is_published,
            "banca_catalog": item.banca_catalog_id, "banca_name": item.banca_catalog.name if item.banca_catalog_id else None,
            "level": item.level, "state": item.state, "concurso_title": item.concurso.title if item.concurso_id else None,
            "concurso": item.concurso_id, "questions_count": item.questions.count(), "updated_at": item.updated_at}


@api_view(["GET", "POST"])
@permission_classes([EditorialAccess])
def editorial_exams(request):
    if request.method == "POST":
        serializer = EditorialExamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save(created_by=request.user, updated_by=request.user)
        payload = _editorial_exam_payload(item)
        audit_log(request, action="exam.created", resource_type="exam", resource_id=item.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)
    qs = Exam.objects.select_related("concurso", "banca_catalog").prefetch_related("questions")
    overview = qs.aggregate(total=Count("id"), published=Count("id", filter=Q(is_published=True)), draft=Count("id", filter=Q(is_published=False)),
                            linked=Count("id", filter=Q(concurso__isnull=False)), unlinked=Count("id", filter=Q(concurso__isnull=True)))
    try:
        if concurso := request.query_params.get("concurso"): qs = qs.filter(concurso_id=int(concurso))
        if year := request.query_params.get("year"): qs = qs.filter(year=int(year))
    except (TypeError, ValueError):
        return Response({"detail": "Informe ano e concurso válidos."}, status=400)
    if request.query_params.get("published") in {"1", "0"}: qs = qs.filter(is_published=request.query_params["published"] == "1")
    if request.query_params.get("linked") in {"1", "0"}: qs = qs.filter(concurso__isnull=request.query_params["linked"] == "0")
    if catalog_id := request.query_params.get("banca_catalog"):
        if not catalog_id.isdigit(): return Response({"banca_catalog": ["Banca inválida."]}, status=400)
        qs = qs.filter(banca_catalog_id=int(catalog_id))
    if banca := request.query_params.get("banca", "").strip():
        from apps.questions.naming import banca_query
        qs = qs.filter(banca_query(banca))
    if search := request.query_params.get("search", "").strip():
        qs = qs.filter(Q(title__icontains=search) | Q(banca__icontains=search) | Q(institution__icontains=search) | Q(role__icontains=search))
    if request.query_params.get("options") == "1":
        return Response({"results": list(qs.order_by("-year", "title", "id").values("id", "title", "banca", "year", "role", "is_published", "concurso"))})
    orderings = {"year": ("-year", "title", "id"), "name": ("title", "id"), "recent": ("-updated_at", "-id")}
    qs = qs.order_by(*orderings.get(request.query_params.get("ordering"), orderings["year"]))
    return _editorial_list_response(request, qs, _editorial_exam_payload, overview)


@api_view(["PATCH"])
@permission_classes([EditorialAccess])
def editorial_exam_detail(request, pk):
    item = Exam.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "Prova não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    before = _editorial_exam_payload(item)
    serializer = EditorialExamSerializer(item, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    item = serializer.save(updated_by=request.user)
    payload = _editorial_exam_payload(item)
    audit_log(request, action="exam.updated", resource_type="exam", resource_id=item.id, before=before, after=payload)
    return Response(payload)

def _article_payload(item):
    return {"id": item.id, "title": item.title, "slug": item.slug, "summary": item.summary, "body": item.body, "category": item.category, "image_url": item.image_url, "seo_title": item.seo_title, "seo_description": item.seo_description, "tags": item.tags, "is_featured": item.is_featured, "is_pinned": item.is_pinned, "origin": item.origin, "editorial_status": item.editorial_status, "scheduled_for": item.scheduled_for, "is_published": item.is_published}

@api_view(["GET", "POST"])
@permission_classes([EditorialAccess])
def editorial_categories(request):
    if request.method == "GET": return Response({"results": [{"id": item.id, "name": item.name, "slug": item.slug, "is_active": item.is_active} for item in EditorialCategory.objects.all()]})
    from django.utils.text import slugify
    name = str(request.data.get("name", "")).strip()
    if not name: return Response({"name": ["Informe o nome da categoria."]}, status=status.HTTP_400_BAD_REQUEST)
    item, created = EditorialCategory.objects.get_or_create(name=name, defaults={"slug": slugify(name)[:80]})
    return Response({"id": item.id, "name": item.name, "slug": item.slug, "is_active": item.is_active}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([EditorialAccess])
def editorial_news_history(request, pk):
    if not NewsArticle.objects.filter(pk=pk).exists(): return Response({"detail": "Artigo não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    events = AuditEvent.objects.filter(resource_type="article", resource_id=str(pk)).select_related("actor").order_by("-created_at")[:100]
    return Response({"results": [_audit_payload(event) for event in events]})


@api_view(["GET"])
@permission_classes([EditorialAccess])
def editorial_news_overview(request):
    qs = NewsArticle.objects.all()
    return Response({"total": qs.count(), "draft": qs.filter(editorial_status=NewsArticle.EditorialStatus.DRAFT).count(), "scheduled": qs.filter(editorial_status=NewsArticle.EditorialStatus.SCHEDULED).count(), "published": qs.filter(editorial_status=NewsArticle.EditorialStatus.PUBLISHED).count(), "archived": qs.filter(editorial_status=NewsArticle.EditorialStatus.ARCHIVED).count(), "featured": qs.filter(is_featured=True).count()})


@api_view(["POST"])
@permission_classes([EditorialAccess])
def editorial_news_bulk(request):
    ids, action = request.data.get("ids", []), request.data.get("action")
    if not isinstance(ids, list) or not ids or any(not isinstance(value, int) or isinstance(value, bool) or value < 1 for value in ids) or action not in ("published", "archived", "draft"):
        return Response({"detail": "Selecione artigos e uma ação válida."}, status=400)
    qs = NewsArticle.objects.filter(id__in=ids)
    if qs.count() != len(set(ids)):
        return Response({"detail": "Um ou mais artigos não foram encontrados."}, status=404)
    qs.update(editorial_status=action, is_published=action == "published", scheduled_for=None, published_at=timezone.now() if action == "published" else None)
    audit_log(request, action="article.bulk_updated", resource_type="article", context={"ids": ids, "action": action})
    return Response({"updated": qs.count()})


@api_view(["POST"])
@permission_classes([EditorialAccess])
def editorial_news_duplicate(request, pk):
    item = NewsArticle.objects.filter(pk=pk).first()
    if not item: return Response({"detail": "Artigo não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.origin != Concurso.Origin.MANUAL: return Response({"detail": "Somente artigos manuais podem ser duplicados."}, status=status.HTTP_409_CONFLICT)
    base = f"{item.slug}-copia"[:250]; slug = base; index = 2
    while NewsArticle.objects.filter(slug=slug).exists(): slug = f"{base[:245]}-{index}"; index += 1
    copy = NewsArticle.objects.create(source="manual", external_id=f"manual:{uuid.uuid4()}", origin=Concurso.Origin.MANUAL, slug=slug, title=f"{item.title} (cópia)", summary=item.summary, body=item.body, category=item.category, image_url=item.image_url, seo_title=item.seo_title, seo_description=item.seo_description, tags=item.tags, editorial_status=NewsArticle.EditorialStatus.DRAFT, is_published=False, author=request.user, updated_by=request.user)
    payload = _article_payload(copy); audit_log(request, action="article.duplicated", resource_type="article", resource_id=copy.id, after=payload, context={"source_id": item.id}); return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([EditorialAccess])
def editorial_news(request):
    from django.utils.text import slugify
    if request.method == "POST":
        data = request.data.copy()
        title = str(data.get("title", "")).strip()
        base = slugify(data.get("slug") or title)[:250] or "artigo"; slug = base; index = 2
        while NewsArticle.objects.filter(slug=slug).exists(): slug = f"{base[:245]}-{index}"; index += 1
        data["slug"] = slug
        serializer = EditorialArticleSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        state = serializer.validated_data.get("editorial_status", "draft")
        item = serializer.save(source="manual", external_id=f"manual:{uuid.uuid4()}", origin="manual", author=request.user, updated_by=request.user,
                               is_published=state == "published", published_at=timezone.now() if state == "published" else None)
        payload = _article_payload(item)
        audit_log(request, action="article.created", resource_type="article", resource_id=item.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)
    qs = NewsArticle.objects.all()
    overview = qs.aggregate(total=Count("id"), **{state: Count("id", filter=Q(editorial_status=state)) for state in NewsArticle.EditorialStatus.values}, featured=Count("id", filter=Q(is_featured=True)))
    if value := request.query_params.get("status", "").strip(): qs = qs.filter(editorial_status=value)
    if value := request.query_params.get("category", "").strip(): qs = qs.filter(category__iexact=value)
    if value := request.query_params.get("origin", "").strip(): qs = qs.filter(origin=value)
    if request.query_params.get("featured") in {"1", "0"}: qs = qs.filter(is_featured=request.query_params["featured"] == "1")
    if search := request.query_params.get("search", "").strip(): qs = qs.filter(Q(title__icontains=search) | Q(summary__icontains=search) | Q(category__icontains=search))
    ordering = {"recent": ("-created_at", "-id"), "name": ("title", "id"), "updated": ("-fetched_at", "-id")}
    qs = qs.order_by(*ordering.get(request.query_params.get("ordering"), ordering["recent"]))
    return _editorial_list_response(request, qs, _article_payload, overview)

@api_view(["PATCH"])
@permission_classes([EditorialAccess])
def editorial_news_detail(request, pk):
    item = NewsArticle.objects.filter(pk=pk).first()
    if not item: return Response({"detail": "Artigo não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    protected = {"title", "body", "summary", "category", "image_url", "slug", "seo_title", "seo_description", "tags", "is_featured", "is_pinned"}
    if item.origin == Concurso.Origin.IMPORTED and protected.intersection(request.data): return Response({"detail": "Campos de notícia importada são protegidos contra sincronização."}, status=status.HTTP_409_CONFLICT)
    before = _article_payload(item)
    serializer = EditorialArticleSerializer(item, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    new_status = serializer.validated_data.get("editorial_status", item.editorial_status)
    extras = {"updated_by": request.user, "is_published": new_status == "published"}
    if new_status != "scheduled": extras["scheduled_for"] = None
    if new_status == "published" and item.editorial_status != "published": extras["published_at"] = timezone.now()
    item = serializer.save(**extras)
    payload = _article_payload(item)
    audit_log(request, action="article.updated", resource_type="article", resource_id=item.id, before=before, after=payload)
    return Response(payload)
