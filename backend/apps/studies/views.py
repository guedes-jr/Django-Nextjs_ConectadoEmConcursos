from datetime import date, time, timedelta
from collections import defaultdict

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.questions.models import QuestionReview, UserAnswer
from .models import StudyBlock, StudyInterval, StudyPlan, StudySession


def _next_week_start(day):
    return day - timedelta(days=day.weekday())


def _generate(plan, start):
    if plan.kind == StudyPlan.Kind.SCHEDULE:
        _generate_schedule_blocks(plan, start, 28)
    elif plan.kind == StudyPlan.Kind.CYCLE:
        _generate_cycle_blocks(plan, start, 28)
    else:
        _generate_track_blocks(plan, start, 28)


def _generate_track_blocks(plan, start, days=28):
    pending = []
    sequence = 0
    for offset in range(days):
        day = start + timedelta(days=offset)
        if day.weekday() not in plan.weekdays or (plan.exam_date and day > plan.exam_date):
            continue
        if plan.blocks.filter(date=day).exists():
            continue
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


def _generate_schedule_blocks(plan, start, days=28):
    by_weekday = {}
    for row in plan.schedule:
        try:
            weekday = int(row.get("weekday"))
        except (TypeError, ValueError):
            continue
        by_weekday[weekday] = row
    pending = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        entry = by_weekday.get(day.weekday())
        if not entry or (plan.exam_date and day > plan.exam_date) or plan.blocks.filter(date=day).exists():
            continue
        disciplines = [d for d in entry.get("disciplines", []) if d]
        if not disciplines:
            continue
        try:
            day_minutes = max(15, int(entry.get("minutes") or plan.minutes_per_day))
        except (TypeError, ValueError):
            day_minutes = plan.minutes_per_day
        minutes_each = max(15, day_minutes // len(disciplines))
        for index, discipline in enumerate(disciplines):
            kind = StudyBlock.Kind.QUESTIONS if index % 2 else StudyBlock.Kind.THEORY
            pending.append(StudyBlock(
                plan=plan, date=day, discipline=discipline,
                kind=kind, planned_minutes=minutes_each, position=index,
            ))
    StudyBlock.objects.bulk_create(pending)


def _generate_cycle_blocks(plan, start, days=28):
    cycle = plan.cycle
    if not cycle:
        return
    last = plan.blocks.order_by("date", "position").values("cycle_index").last()
    cursor = ((last["cycle_index"] + 1) % len(cycle)) if last else 0
    pending = []
    daily_budget = max(15, plan.minutes_per_day)
    for offset in range(days):
        day = start + timedelta(days=offset)
        if day.weekday() not in plan.weekdays or (plan.exam_date and day > plan.exam_date):
            continue
        if plan.blocks.filter(date=day).exists():
            continue
        remaining = daily_budget
        position = 0
        while remaining > 0:
            item = cycle[cursor % len(cycle)]
            try:
                minutes = max(15, int(item.get("minutes") or 60))
            except (TypeError, ValueError):
                minutes = 60
            if minutes > remaining and position > 0:
                break
            pending.append(StudyBlock(
                plan=plan, date=day, discipline=item["discipline"],
                kind=(item.get("kind") or StudyBlock.Kind.THEORY),
                planned_minutes=minutes, position=position,
                cycle_index=cursor % len(cycle),
            ))
            remaining -= minutes
            cursor += 1
            position += 1
    StudyBlock.objects.bulk_create(pending)


def _normalize_disciplines(value):
    if not isinstance(value, list) or not 1 <= len(value) <= 12:
        return None
    result = []
    for item in value:
        if not isinstance(item, str) or not item.strip() or len(item) > 100:
            return None
        result.append(item.strip())
    return list(dict.fromkeys(result))


def _validate(payload):
    errors = {}

    kind = str(payload.get("kind", "")).strip()
    if not kind:
        kind = StudyPlan.Kind.TRACK
    if kind not in StudyPlan.Kind.values:
        errors["kind"] = "Tipo de plano inválido."
    title = str(payload.get("title", "")).strip()[:80]
    goal = str(payload.get("goal", "")).strip()
    if not goal or len(goal) > 160:
        errors["goal"] = "Informe um objetivo com até 160 caracteres."

    disciplines = _normalize_disciplines(payload.get("disciplines"))
    if not disciplines:
        errors["disciplines"] = "Escolha de 1 a 12 disciplinas."
        disciplines = []

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
            exam_date = date.fromisoformat(exam_date)
            if exam_date < timezone.localdate():
                raise ValueError
        except (TypeError, ValueError):
            errors["exam_date"] = "Informe uma data futura válida."
            exam_date = None

    schedule = []
    if kind == StudyPlan.Kind.SCHEDULE:
        raw_schedule = payload.get("schedule")
        if not isinstance(raw_schedule, list) or not raw_schedule:
            errors["schedule"] = "Distribua as disciplinas nos dias da semana."
        else:
            seen = set()
            for row in raw_schedule:
                try:
                    weekday = int(row.get("weekday"))
                except (TypeError, ValueError):
                    weekday = -1
                if weekday not in weekdays or weekday in seen:
                    continue
                day_disciplines = [d for d in row.get("disciplines", []) if isinstance(d, str) and d.strip()]
                if not day_disciplines:
                    continue
                seen.add(weekday)
                try:
                    day_minutes = int(row.get("minutes") or minutes)
                except (TypeError, ValueError):
                    day_minutes = minutes
                schedule.append({
                    "weekday": weekday,
                    "disciplines": list(dict.fromkeys(day_disciplines)),
                    "minutes": max(15, min(480, day_minutes)),
                })
            if not schedule:
                errors["schedule"] = "Atribua ao menos uma disciplina a um dia escolhido."

    cycle = []
    if kind == StudyPlan.Kind.CYCLE:
        raw_cycle = payload.get("cycle")
        if not isinstance(raw_cycle, list) or not raw_cycle:
            errors["cycle"] = "Monte o ciclo com ao menos uma disciplina."
        elif len(raw_cycle) > 20:
            errors["cycle"] = "O ciclo pode ter no máximo 20 itens."
        else:
            for item in raw_cycle:
                discipline = item.get("discipline", "")
                if not discipline or len(discipline) > 100:
                    errors["cycle"] = "Cada item do ciclo precisa de uma disciplina."
                    break
                try:
                    item_minutes = int(item.get("minutes") or 60)
                    if item_minutes < 25 or item_minutes > 600:
                        raise ValueError
                except (TypeError, ValueError):
                    errors["cycle"] = "Use entre 25 e 600 minutos por item."
                    break
                item_kind = item.get("kind") or StudyBlock.Kind.THEORY
                if item_kind not in StudyBlock.Kind.values:
                    errors["cycle"] = "Tipo inválido em item do ciclo."
                    break
                cycle.append({"discipline": discipline, "minutes": min(item_minutes, 600), "kind": item_kind})

    reminder_enabled = bool(payload.get("reminder_enabled", False))
    reminder_time = payload.get("reminder_time") or None
    if reminder_enabled:
        try:
            hour, minute = reminder_time.split(":")
            reminder_time = time(int(hour), int(minute))
        except (TypeError, ValueError, AttributeError):
            errors["reminder_time"] = "Informe o horário do lembrete (formato HH:MM)."
            reminder_time = None

    return errors, dict(
        kind=kind, title=title, goal=goal, exam_date=exam_date,
        disciplines=disciplines, weekdays=weekdays, minutes_per_day=minutes,
        schedule=schedule, cycle=cycle,
        reminder_enabled=reminder_enabled, reminder_time=reminder_time, active=True,
    )


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
    today_cycle = []
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
            "answered_questions": count, "cycle_index": item.cycle_index,
        })
        if plan.kind == StudyPlan.Kind.CYCLE and item.date == today:
            today_cycle.append({
                "discipline": item.discipline, "minutes": item.planned_minutes,
                "kind": item.kind, "cycle_index": item.cycle_index, "status": item.status,
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
    next_cursor = 0
    if plan.kind == StudyPlan.Kind.CYCLE and plan.cycle:
        last = plan.blocks.order_by("date", "position").values("cycle_index").last()
        next_cursor = ((last["cycle_index"] + 1) % len(plan.cycle)) if last else 0
    return {
        "id": plan.id, "kind": plan.kind, "title": plan.title, "goal": plan.goal,
        "exam_date": plan.exam_date.isoformat() if plan.exam_date else None,
        "disciplines": plan.disciplines, "weekdays": plan.weekdays,
        "minutes_per_day": plan.minutes_per_day, "schedule": plan.schedule, "cycle": plan.cycle,
        "reminder_enabled": plan.reminder_enabled,
        "reminder_time": plan.reminder_time.strftime("%H:%M") if plan.reminder_time else None,
        "week_start": start.isoformat(),
        "blocks": result, "review_due": due, "today_cycle": today_cycle, "cycle_index": next_cursor,
        "weekly_answers": stats["total"], "weekly_correct": stats["correct"],
        "weekly_completed": sum(x["status"] == StudyBlock.Status.DONE for x in result),
        "weekly_planned": len(result),
        "discipline_stats": discipline_stats,
    }


def _summary(plan):
    today = timezone.localdate()
    start = _next_week_start(today)
    end = start + timedelta(days=7)
    blocks = plan.blocks.filter(date__gte=start, date__lt=end)
    return {
        "id": plan.id, "kind": plan.kind, "title": plan.title, "goal": plan.goal,
        "exam_date": plan.exam_date.isoformat() if plan.exam_date else None,
        "disciplines": plan.disciplines, "weekdays": plan.weekdays,
        "minutes_per_day": plan.minutes_per_day, "active": plan.active,
        "created_at": plan.created_at.isoformat(),
        "weekly_completed": blocks.filter(status=StudyBlock.Status.DONE).count(),
        "weekly_planned": blocks.count(),
        "blocks_today": blocks.filter(date=today, status=StudyBlock.Status.PENDING).count(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def plans(request):
    if request.method == "GET":
        items = StudyPlan.objects.filter(user=request.user)
        return Response([_summary(plan) for plan in items])
    errors, values = _validate(request.data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        plan = StudyPlan.objects.create(user=request.user, **values)
        _generate(plan, timezone.localdate())
    return Response(_representation(plan, 0), status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def plan_detail(request, plan_id):
    plan = StudyPlan.objects.filter(id=plan_id, user=request.user).first()
    if not plan:
        return Response({"detail": "Plano não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "GET":
        try:
            week = int(request.query_params.get("week", 0))
        except ValueError:
            return Response({"week": "Semana inválida."}, status=status.HTTP_400_BAD_REQUEST)
        if not 0 <= week <= 12:
            return Response({"week": "Escolha uma semana entre 0 e 12."}, status=status.HTTP_400_BAD_REQUEST)
        week_start = _next_week_start(timezone.localdate()) + timedelta(days=7 * week)
        _generate(plan, max(timezone.localdate(), week_start))
        return Response(_representation(plan, week))
    errors, values = _validate(request.data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        plan.blocks.filter(date__gte=timezone.localdate(), status=StudyBlock.Status.PENDING).delete()
        for key, value in values.items():
            setattr(plan, key, value)
        plan.save()
        _generate(plan, timezone.localdate())
    return Response(_representation(plan, 0))


def _owned_block(request, block_id):
    return StudyBlock.objects.filter(id=block_id, plan__user=request.user).first()


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def block(request, plan_id, block_id):
    item = _owned_block(request, block_id)
    if not item:
        return Response({"detail": "Atividade não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    updates = []
    if "status" in request.data:
        if request.data["status"] not in StudyBlock.Status.values:
            return Response({"status": "Situação inválida."}, status=status.HTTP_400_BAD_REQUEST)
        item.status = request.data["status"]
        updates.append("status")
    if "date" in request.data:
        try:
            day = date.fromisoformat(request.data["date"])
            if day < timezone.localdate() or (item.plan.exam_date and day > item.plan.exam_date):
                raise ValueError
        except (ValueError, TypeError):
            return Response({"date": "Escolha uma data válida a partir de hoje."}, status=status.HTTP_400_BAD_REQUEST)
        item.date = day
        updates.append("date")
    if "planned_minutes" in request.data:
        try:
            minutes = int(request.data["planned_minutes"])
            if minutes < 10 or minutes > 480:
                raise ValueError
        except (ValueError, TypeError):
            return Response({"planned_minutes": "Use entre 10 e 480 minutos."}, status=status.HTTP_400_BAD_REQUEST)
        item.planned_minutes = minutes
        updates.append("planned_minutes")
    if updates:
        item.save(update_fields=updates)
    return Response({"id": item.id, "status": item.status, "date": item.date.isoformat(), "planned_minutes": item.planned_minutes})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def session(request, plan_id, block_id):
    item = _owned_block(request, block_id)
    if not item:
        return Response({"detail": "Atividade não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    try:
        minutes = int(request.data.get("minutes"))
        if minutes < 1 or minutes > 480:
            raise ValueError
    except (TypeError, ValueError):
        return Response({"minutes": "Informe de 1 a 480 minutos."}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        StudySession.objects.create(block=item, minutes=minutes)
        item.status = StudyBlock.Status.DONE
        item.save(update_fields=["status"])
    return Response({"status": item.status, "actual_minutes": item.sessions.aggregate(total=Sum("minutes"))["total"]}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def replan(request, plan_id):
    current = StudyPlan.objects.filter(id=plan_id, user=request.user).first()
    if not current:
        return Response({"detail": "Plano não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    today = timezone.localdate()
    overdue = list(current.blocks.filter(Q(date__lt=today, status=StudyBlock.Status.PENDING) | Q(status=StudyBlock.Status.SKIPPED)).order_by("date", "position"))
    days = [today + timedelta(days=n) for n in range(28)]
    days = [day for day in days if day.weekday() in current.weekdays and (not current.exam_date or day <= current.exam_date)]
    if overdue and not days:
        return Response({"detail": "Não há dias disponíveis antes da prova."}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        for index, item in enumerate(overdue):
            item.date = days[index % len(days)]
            item.status = StudyBlock.Status.PENDING
            item.save(update_fields=["date", "status"])
    return Response({"rescheduled": len(overdue), "plan": _representation(current, 0)})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def intervals(request):
    if request.method == "GET":
        today = timezone.localdate()
        items = StudyInterval.objects.filter(user=request.user, started_at__date=today)
        return Response([{
            "id": item.id, "plan_id": item.plan_id, "kind": item.kind,
            "minutes": item.minutes, "started_at": item.started_at.isoformat(),
        } for item in items])
    plan_id = request.data.get("plan_id")
    plan = StudyPlan.objects.filter(id=plan_id, user=request.user).first() if plan_id else None
    try:
        minutes = int(request.data.get("minutes"))
        if minutes < 1 or minutes > 480:
            raise ValueError
    except (TypeError, ValueError):
        return Response({"minutes": "Informe de 1 a 480 minutos."}, status=status.HTTP_400_BAD_REQUEST)
    kind = request.data.get("kind")
    if kind not in StudyInterval.Kind.values:
        return Response({"kind": "Tipo de intervalo inválido."}, status=status.HTTP_400_BAD_REQUEST)
    item = StudyInterval.objects.create(user=request.user, plan=plan, minutes=minutes, kind=kind)
    return Response({
        "id": item.id, "plan_id": item.plan_id, "kind": item.kind,
        "minutes": item.minutes, "started_at": item.started_at.isoformat(),
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def alerts(request):
    plans = StudyPlan.objects.filter(user=request.user, active=True)
    today = timezone.localdate()
    blocks_today = StudyBlock.objects.filter(plan__in=plans, date=today, status=StudyBlock.Status.PENDING).count()
    due = QuestionReview.objects.filter(user=request.user, next_review_at__date__lte=today).count()
    due += QuestionReview.objects.filter(user=request.user, is_marked=True, next_review_at__isnull=True).count()
    exam_dates = [plan.exam_date for plan in plans if plan.exam_date]
    exam_in_days = min((day - today).days for day in exam_dates) if exam_dates else None
    reminder = next((plan for plan in plans if plan.reminder_enabled and plan.reminder_time), None)
    return Response({
        "blocks_today": blocks_today,
        "reviews_due": due,
        "exam_in_days": exam_in_days,
        "reminder_time": reminder.reminder_time.strftime("%H:%M") if reminder else None,
        "plans": plans.count(),
    })