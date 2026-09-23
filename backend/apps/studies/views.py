from collections import defaultdict
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.questions.models import QuestionReview, UserAnswer
from .models import StudyBlock, StudyPlan, StudySession


def _next_week_start(day):
    return day - timedelta(days=day.weekday())


def _generate_blocks(plan, start, days=28):
    pending = []
    sequence = 0
    for offset in range(days):
        day = start + timedelta(days=offset)
        if day.weekday() not in plan.weekdays or (plan.exam_date and day > plan.exam_date):
            continue
        if plan.blocks.filter(date=day).exists():
            continue
        # Two focused blocks make the daily plan legible on small screens.
        kinds = [StudyBlock.Kind.THEORY, StudyBlock.Kind.QUESTIONS]
        if sequence % 3 == 2:
            kinds[0] = StudyBlock.Kind.REVIEW
        first = max(15, plan.minutes_per_day // 2)
        durations = [first, max(15, plan.minutes_per_day - first)] if plan.minutes_per_day >= 30 else [plan.minutes_per_day]
        for position, minutes in enumerate(durations):
            pending.append(StudyBlock(
                plan=plan, date=day,
                discipline=plan.disciplines[(sequence + position) % len(plan.disciplines)],
                kind=kinds[position], planned_minutes=minutes, position=position,
            ))
        sequence += 1
    StudyBlock.objects.bulk_create(pending)


def _validate(payload):
    errors = {}
    goal = str(payload.get("goal", "")).strip()
    if not goal or len(goal) > 160:
        errors["goal"] = "Informe um objetivo com até 160 caracteres."
    disciplines = payload.get("disciplines")
    if not isinstance(disciplines, list) or not 1 <= len(disciplines) <= 12 or any(not isinstance(x, str) or not x.strip() or len(x) > 100 for x in disciplines):
        errors["disciplines"] = "Escolha de 1 a 12 disciplinas."
        disciplines = []
    else:
        disciplines = list(dict.fromkeys(x.strip() for x in disciplines))
    weekdays = payload.get("weekdays")
    if not isinstance(weekdays, list) or not weekdays or any(type(x) is not int or x < 0 or x > 6 for x in weekdays):
        errors["weekdays"] = "Escolha ao menos um dia da semana."
        weekdays = []
    else:
        weekdays = sorted(set(weekdays))
    try:
        minutes = int(payload.get("minutes_per_day"))
        if minutes < 25 or minutes > 480:
            raise ValueError
    except (TypeError, ValueError):
        errors["minutes_per_day"] = "Use entre 25 e 480 minutos por dia."
        minutes = 60
    exam_date = payload.get("exam_date") or None
    if exam_date:
        try:
            from datetime import date
            exam_date = date.fromisoformat(exam_date)
            if exam_date < timezone.localdate():
                raise ValueError
        except (TypeError, ValueError):
            errors["exam_date"] = "Informe uma data futura válida."
            exam_date = None
    return errors, dict(goal=goal, disciplines=disciplines, weekdays=weekdays, minutes_per_day=minutes, exam_date=exam_date)


def _representation(plan, week):
    today = timezone.localdate()
    start = _next_week_start(today) + timedelta(days=7 * week)
    end = start + timedelta(days=7)
    blocks = list(plan.blocks.filter(date__gte=start, date__lt=end).prefetch_related("sessions"))
    answers = UserAnswer.objects.filter(user=plan.user, created_at__date__gte=start, created_at__date__lt=end)
    daily_answers = defaultdict(int)
    for row in answers.annotate(day=TruncDate("created_at")).values("day", "question__discipline").annotate(total=Count("id")):
        daily_answers[(row["day"], row["question__discipline"])] = row["total"]
    changed = []
    result = []
    for item in blocks:
        count = daily_answers[(item.date, item.discipline)] if item.kind == StudyBlock.Kind.QUESTIONS else 0
        if item.kind == StudyBlock.Kind.QUESTIONS and item.status == StudyBlock.Status.PENDING and count >= 10:
            item.status = StudyBlock.Status.DONE
            changed.append(item)
        minutes = sum(session.minutes for session in item.sessions.all())
        result.append({
            "id": item.id, "date": item.date.isoformat(), "discipline": item.discipline,
            "kind": item.kind, "planned_minutes": item.planned_minutes,
            "status": item.status, "position": item.position, "actual_minutes": minutes,
            "answered_questions": count,
        })
    if changed:
        StudyBlock.objects.bulk_update(changed, ["status"])
    due = QuestionReview.objects.filter(user=plan.user, next_review_at__date__lte=today).count()
    due += QuestionReview.objects.filter(user=plan.user, is_marked=True, next_review_at__isnull=True).count()
    stats = answers.aggregate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
    answer_by_discipline = {
        row["question__discipline"]: {"answered": row["total"], "correct": row["correct"]}
        for row in answers.values("question__discipline").annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
    }
    discipline_stats = []
    for discipline in plan.disciplines:
        entries = [item for item in result if item["discipline"] == discipline]
        counts = answer_by_discipline.get(discipline, {"answered": 0, "correct": 0})
        discipline_stats.append({
            "discipline": discipline,
            "planned_minutes": sum(item["planned_minutes"] for item in entries),
            "actual_minutes": sum(item["actual_minutes"] for item in entries),
            "completed": sum(item["status"] == StudyBlock.Status.DONE for item in entries),
            "total": len(entries),
            **counts,
        })
    return {
        "id": plan.id, "goal": plan.goal, "exam_date": plan.exam_date.isoformat() if plan.exam_date else None,
        "disciplines": plan.disciplines, "weekdays": plan.weekdays,
        "minutes_per_day": plan.minutes_per_day, "week_start": start.isoformat(),
        "blocks": result, "review_due": due,
        "weekly_answers": stats["total"], "weekly_correct": stats["correct"],
        "weekly_completed": sum(x["status"] == StudyBlock.Status.DONE for x in result),
        "weekly_planned": len(result),
        "discipline_stats": discipline_stats,
    }


@api_view(["GET", "POST", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def plan(request):
    existing = StudyPlan.objects.filter(user=request.user).first()
    if request.method == "GET":
        if not existing:
            return Response(None)
        try:
            week = int(request.query_params.get("week", 0))
        except ValueError:
            return Response({"week": "Semana inválida."}, status=400)
        if not 0 <= week <= 12:
            return Response({"week": "Escolha uma semana entre 0 e 12."}, status=400)
        week_start = _next_week_start(timezone.localdate()) + timedelta(days=7 * week)
        _generate_blocks(existing, max(timezone.localdate(), week_start), 7)
        return Response(_representation(existing, week))
    if request.method == "DELETE":
        if existing:
            existing.delete()
        return Response(status=204)
    errors, values = _validate(request.data)
    if errors:
        return Response(errors, status=400)
    if request.method == "POST" and existing:
        return Response({"detail": "Já existe um plano ativo. Edite o plano atual."}, status=409)
    if request.method == "PATCH" and not existing:
        return Response({"detail": "Crie um plano primeiro."}, status=404)
    with transaction.atomic():
        if existing:
            # Preserve completed history and recorded sessions.
            existing.blocks.filter(date__gte=timezone.localdate(), status=StudyBlock.Status.PENDING).delete()
            for key, value in values.items():
                setattr(existing, key, value)
            existing.save()
            current = existing
        else:
            current = StudyPlan.objects.create(user=request.user, **values)
        _generate_blocks(current, timezone.localdate())
    return Response(_representation(current, 0), status=200 if existing else 201)


def _owned_block(request, block_id):
    return StudyBlock.objects.filter(id=block_id, plan__user=request.user).first()


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def block(request, block_id):
    item = _owned_block(request, block_id)
    if not item:
        return Response({"detail": "Atividade não encontrada."}, status=404)
    updates = []
    if "status" in request.data:
        if request.data["status"] not in StudyBlock.Status.values:
            return Response({"status": "Situação inválida."}, status=400)
        item.status = request.data["status"]
        updates.append("status")
    if "date" in request.data:
        from datetime import date
        try:
            day = date.fromisoformat(request.data["date"])
            if day < timezone.localdate() or (item.plan.exam_date and day > item.plan.exam_date):
                raise ValueError
        except (ValueError, TypeError):
            return Response({"date": "Escolha uma data válida a partir de hoje."}, status=400)
        item.date = day
        updates.append("date")
    if "planned_minutes" in request.data:
        try:
            minutes = int(request.data["planned_minutes"])
            if minutes < 10 or minutes > 480:
                raise ValueError
        except (ValueError, TypeError):
            return Response({"planned_minutes": "Use entre 10 e 480 minutos."}, status=400)
        item.planned_minutes = minutes
        updates.append("planned_minutes")
    if updates:
        item.save(update_fields=updates)
    return Response({"id": item.id, "status": item.status, "date": item.date.isoformat(), "planned_minutes": item.planned_minutes})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def session(request, block_id):
    item = _owned_block(request, block_id)
    if not item:
        return Response({"detail": "Atividade não encontrada."}, status=404)
    try:
        minutes = int(request.data.get("minutes"))
        if minutes < 1 or minutes > 480:
            raise ValueError
    except (TypeError, ValueError):
        return Response({"minutes": "Informe de 1 a 480 minutos."}, status=400)
    with transaction.atomic():
        StudySession.objects.create(block=item, minutes=minutes)
        item.status = StudyBlock.Status.DONE
        item.save(update_fields=["status"])
    return Response({"status": item.status, "actual_minutes": item.sessions.aggregate(total=Sum("minutes"))["total"]}, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def replan(request):
    current = StudyPlan.objects.filter(user=request.user).first()
    if not current:
        return Response({"detail": "Crie um plano primeiro."}, status=404)
    today = timezone.localdate()
    overdue = list(current.blocks.filter(Q(date__lt=today, status=StudyBlock.Status.PENDING) | Q(status=StudyBlock.Status.SKIPPED)).order_by("date", "position"))
    days = [today + timedelta(days=n) for n in range(28)]
    days = [day for day in days if day.weekday() in current.weekdays and (not current.exam_date or day <= current.exam_date)]
    if overdue and not days:
        return Response({"detail": "Não há dias disponíveis antes da prova."}, status=400)
    with transaction.atomic():
        for index, item in enumerate(overdue):
            item.date = days[index % len(days)]
            item.status = StudyBlock.Status.PENDING
            item.save(update_fields=["date", "status"])
    return Response({"rescheduled": len(overdue), "plan": _representation(current, 0)})
