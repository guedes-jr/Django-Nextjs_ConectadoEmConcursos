import datetime as dt

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, F, Max, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.billing.models import Plan, Subscription
from apps.chat.models import ChatUsage, Conversation, Message
from apps.concursos.models import Concurso, NewsArticle
from apps.questions.models import Question, UserAnswer
from apps.studies.models import StudySession
from apps.workspace.models import CommunityPost, ExamSubmission, Flashcard, SimulationRun

from . import services
from .serializers import PlanSerializer, SubscriptionAdminSerializer

User = get_user_model()


def _staff(request):
    return IsAdminUser().has_permission(request, None)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def overview(request):
    sub_with_comment = Question.objects.exclude(explanation="").order_by().values("id")
    news_unpublished = NewsArticle.objects.filter(is_published=False).count()
    posts = CommunityPost.objects.count()
    sub = Subscription.objects
    backups = services.list_backups()
    recent_subs = Subscription.objects.select_related("user", "plan").order_by("-created_at")[:5]
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
                "pending_payment": sub.filter(status=Subscription.Status.PENDING).count(),
                "canceled": sub.filter(status=Subscription.Status.CANCELED).count(),
            },
            "plans": {"total": Plan.objects.count(), "active": Plan.objects.filter(is_active=True).count()},
            "questions": {
                "total": Question.objects.count(),
                "uncommented": Question.objects.filter(explanation="").count(),
                "with_comment": Question.objects.exclude(explanation="").count(),
            },
            "proofs": {
                "pending": ExamSubmission.objects.filter(status=ExamSubmission.Status.PENDING).count(),
                "reviewed": ExamSubmission.objects.filter(status=ExamSubmission.Status.REVIEWED).count(),
            },
            "content": {
                "news_total": NewsArticle.objects.count(),
                "news_unpublished": news_unpublished,
                "community_posts": posts,
                "concursos_total": Concurso.objects.count(),
                "concursos_open": Concurso.objects.filter(status=Concurso.Status.OPEN).count(),
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
    limit = int(request.query_params.get("limit", 50))
    qs = User.objects.all()
    if search:
        qs = qs.filter(username__icontains=search) | qs.filter(email__icontains=search)
    rows = []
    for u in qs.order_by("-date_joined")[:limit]:
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
    return Response({"results": rows, "total": qs.count()})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def update_user(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if "is_active" in request.data and isinstance(request.data["is_active"], bool):
        user.is_active = request.data["is_active"]
        user.save(update_fields=["is_active"])
    return Response({"id": user.id, "is_active": user.is_active})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def assign_subscription(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    plan = Plan.objects.filter(slug=request.data.get("plan", "")).first()
    if not plan:
        return Response({"detail": "Plano inválido."}, status=status.HTTP_400_BAD_REQUEST)
    cycle = request.data.get("cycle", Subscription.Cycle.MONTHLY)
    status_ = Subscription.Status.ACTIVE if plan.monthly_price == 0 else Subscription.Status.PENDING
    sub, _ = Subscription.objects.update_or_create(
        user=user,
        defaults={"plan": plan, "cycle": cycle, "status": status_},
    )
    return Response({"id": sub.id, "status": sub.status, "plan": plan.name})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def list_subscriptions(request):
    status_filter = request.query_params.get("status", "").strip()
    search = request.query_params.get("search", "").strip()
    qs = Subscription.objects.select_related("user", "plan").order_by("-created_at")
    if status_filter:
        qs = qs.filter(status=status_filter)
    if search:
        qs = qs.filter(user__username__icontains=search) | qs.filter(user__email__icontains=search)
    return Response({"results": SubscriptionAdminSerializer(qs[:200], many=True).data})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def update_subscription(request, pk):
    try:
        sub = Subscription.objects.select_for_update().get(pk=pk)
    except Subscription.DoesNotExist:
        return Response({"detail": "Assinatura não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    data = request.data
    if "plan" in data:
        plan = Plan.objects.filter(slug=data["plan"]).first()
        if not plan:
            return Response({"detail": "Plano inválido."}, status=status.HTTP_400_BAD_REQUEST)
        sub.plan = plan
    if "cycle" in data:
        sub.cycle = data["cycle"]
    if "status" in data:
        sub.status = data["status"]
    sub.save()
    return Response(SubscriptionAdminSerializer(sub).data)


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def plans(request):
    if request.method == "POST":
        ser = PlanSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)
    qs = Plan.objects.order_by("sort_order", "name")
    return Response({"results": PlanSerializer(qs, many=True).data})


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def plan_detail(request, pk):
    try:
        plan = Plan.objects.get(pk=pk)
    except Plan.DoesNotExist:
        return Response({"detail": "Plano não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        if Subscription.objects.filter(plan=plan).exists():
            return Response({"detail": "Plano em uso por assinaturas."}, status=status.HTTP_400_BAD_REQUEST)
        plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    ser = PlanSerializer(plan, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(ser.data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminUser])
def proofs(request):
    if request.method == "GET":
        status_filter = request.query_params.get("status", "").strip()
        qs = ExamSubmission.objects.select_related("user").order_by("-created_at")
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
        return Response({"detail": "Prova não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    new_status = request.data.get("status")
    if new_status not in ExamSubmission.Status.values:
        return Response({"detail": "Status inválido."}, status=status.HTTP_400_BAD_REQUEST)
    proof.status = new_status
    proof.save(update_fields=["status"])
    return Response({"id": proof.id, "status": proof.status})


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminUser])
def questions_admin(request):
    if request.method == "GET":
        only_empty = request.query_params.get("only_uncommented") == "1"
        search = request.query_params.get("search", "").strip()
        qs = Question.objects.select_related("exam").order_by("-id")
        if only_empty:
            qs = qs.filter(explanation="")
        if search:
            qs = qs.filter(statement__icontains=search) | qs.filter(discipline__icontains=search)
        return Response(
            {
                "total": qs.count(),
                "results": [
                    {
                        "id": q.id,
                        "exam_title": q.exam.title if q.exam else None,
                        "discipline": q.discipline,
                        "banca": q.banca,
                        "statement": q.statement[:160],
                        "explanation": q.explanation,
                        "is_active": q.is_active,
                    }
                    for q in qs[:200]
                ],
            }
        )
    pk = request.data.get("id")
    try:
        question = Question.objects.get(pk=pk)
    except Question.DoesNotExist:
        return Response({"detail": "Questão não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    for field in ("explanation", "is_active"):
        if field in request.data:
            setattr(question, field, request.data[field])
    question.save()
    return Response({"id": question.id, "explanation": question.explanation, "is_active": question.is_active})


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
                        "published_at": n.published_at.isoformat() if n.published_at else None,
                    }
                    for n in qs[:100]
                ]
            }
        )
    pk = request.data.get("id")
    try:
        news = NewsArticle.objects.get(pk=pk)
    except NewsArticle.DoesNotExist:
        return Response({"detail": "Notícia não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if "is_published" in request.data and isinstance(request.data["is_published"], bool):
        news.is_published = request.data["is_published"]
        news.save(update_fields=["is_published"])
    return Response({"id": news.id, "is_published": news.is_published})


@api_view(["GET", "DELETE"])
@permission_classes([IsAdminUser])
def community_admin(request):
    if request.method == "DELETE":
        pk = request.query_params.get("id") or (request.data.get("id") if request.data else None)
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
                    "published_at": c.published_at.isoformat() if c.published_at else None,
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
        return Response({"name": name}, status=status.HTTP_201_CREATED)
    return Response({"results": services.list_backups()})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def restore(request, name):
    try:
        result = services.restore_backup(name)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        .annotate(queries=Count("id"), tokens=Sum("input_tokens") + Sum("output_tokens"))
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
    if request.method == "POST":
        data = request.data
        username = (data.get("username") or "").strip()
        email = (data.get("email") or "").strip()
        password = data.get("password") or ""
        if not username or not password:
            return Response({"detail": "Usuário e senha são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({"detail": "Já existe um usuário com esse nome."}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=username, email=email, password=password, is_staff=True)
        return Response(_staff_payload(user), status=status.HTTP_201_CREATED)

    qs = User.objects.filter(is_staff=True).order_by("username")
    return Response({"results": [_staff_payload(u) for u in qs]})


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def staff_detail(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    data = request.data
    if "is_staff" in data and user.pk == request.user.pk:
        return Response({"detail": "Você não pode alterar o próprio cargo."}, status=status.HTTP_400_BAD_REQUEST)
    for field in ("is_staff", "is_active", "email", "first_name", "last_name"):
        if field in data:
            setattr(user, field, data[field])
    user.save()
    return Response(_staff_payload(user))


def _staff_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
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
            StudySession.objects
            .annotate(user_id=F("block__plan__user_id"))
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
        UserAnswer.objects.filter(created_at__date__gte=since).values_list("user_id", flat=True).distinct()
    )
    active_user_ids = set(active_user_ids)
    active_user_ids.update(
        SimulationRun.objects.filter(created_at__date__gte=since).values_list("user_id", flat=True)
    )
    active_user_ids.update(
        StudySession.objects.filter(completed_at__date__gte=since).values_list("block__plan__user_id", flat=True)
    )
    active_user_ids.update(ChatUsage.objects.filter(created_at__date__gte=since).values_list("user_id", flat=True))

    return Response(
        {
            "total_answers": total_answers,
            "correct_answers": correct_answers,
            "accuracy": round(correct_answers / total_answers * 100, 1) if total_answers else 0,
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
                    "last_activity": s["last_activity"].isoformat() if s["last_activity"] else None,
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