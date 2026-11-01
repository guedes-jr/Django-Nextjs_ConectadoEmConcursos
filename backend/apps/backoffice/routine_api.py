from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .audit import log as audit_log
from .models import OperationalRoutine, RoutineExecution, RoutineSchedule
from .permissions import SuperuserAccess, diagnostics_allowed
from .routines import CATALOG, TIMEZONES, next_run


class ScheduleInput(serializers.Serializer):
    routine = serializers.ChoiceField(choices=list(CATALOG))
    name = serializers.CharField(max_length=120)
    enabled = serializers.BooleanField()
    frequency = serializers.ChoiceField(choices=["interval", "daily"])
    interval_minutes = serializers.IntegerField(min_value=1, max_value=43200)
    time_of_day = serializers.TimeField(input_formats=["%H:%M"])
    timezone_name = serializers.ChoiceField(choices=TIMEZONES)


class ScheduleSerializer(serializers.ModelSerializer):
    routine = serializers.CharField(source="routine_id")
    time_of_day = serializers.TimeField(format="%H:%M")

    class Meta:
        model = RoutineSchedule
        fields = ["id", "routine", "name", "enabled", "frequency", "interval_minutes", "time_of_day", "timezone_name", "next_run_at", "updated_at"]


class ExecutionSerializer(serializers.ModelSerializer):
    routine = serializers.CharField(source="routine_id")

    class Meta:
        model = RoutineExecution
        fields = ["id", "schedule_id", "schedule_name", "routine", "scheduled_for", "started_at", "finished_at", "status", "duration_ms", "log_truncated"]


class ExecutionQuery(serializers.Serializer):
    routine = serializers.ChoiceField(choices=["", *CATALOG], default="")
    status = serializers.ChoiceField(choices=["", *RoutineExecution.Status.values], default="")
    page = serializers.IntegerField(min_value=1, max_value=100000, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100, default=20)


def respond(data, status=200):
    response = Response(data, status=status)
    response["Cache-Control"] = "no-store"
    return response


@api_view(["GET", "POST"])
@permission_classes([SuperuserAccess])
def schedules(request):
    if request.method == "GET":
        routines = OperationalRoutine.objects.in_bulk()
        now = timezone.now()
        return respond({"results": ScheduleSerializer(RoutineSchedule.objects.all(), many=True).data,
            "catalog": [{"id": key, "title": value["title"], "last_tick_at": routines[key].last_tick_at if key in routines else None,
                         "executor_active": bool(key in routines and routines[key].last_tick_at and (now - routines[key].last_tick_at).total_seconds() < 180)}
                        for key, value in CATALOG.items()], "timezones": TIMEZONES, "can_view_logs": diagnostics_allowed(request.user)})
    return save_schedule(request)


def save_schedule(request, pk=None):
    if not isinstance(request.data, dict) or set(request.data) - set(ScheduleInput().fields):
        raise serializers.ValidationError({"detail": "Informe somente os campos do agendamento."})
    serializer = ScheduleInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    with transaction.atomic():
        schedule = get_object_or_404(RoutineSchedule.objects.select_for_update(), pk=pk) if pk else RoutineSchedule()
        if pk and data["routine"] != schedule.routine_id:
            raise serializers.ValidationError({"detail": "A rotina do agendamento é fixa. Crie outro agendamento para mudar a rotina."})
        before = ScheduleSerializer(schedule).data if pk else {}
        # routine IDs always come from the code catalog, never command text.
        schedule.routine = OperationalRoutine.objects.get(pk=data.pop("routine"))
        changed_timing = not pk or any(getattr(schedule, key) != data[key] for key in ["enabled", "frequency", "interval_minutes", "time_of_day", "timezone_name"])
        for key, value in data.items():
            setattr(schedule, key, value)
        if changed_timing:
            schedule.next_run_at = next_run(schedule, timezone.now())
        schedule.updated_by = request.user
        schedule.save()
        after = ScheduleSerializer(schedule).data
        audit_log(request, action="routine.schedule_updated" if pk else "routine.schedule_created", resource_type="routine_schedule",
                  resource_id=schedule.pk, before=before, after=after)
    return respond(after, status=200 if pk else 201)


@api_view(["PUT"])
@permission_classes([SuperuserAccess])
def schedule_detail(request, pk):
    return save_schedule(request, pk)


@api_view(["GET"])
@permission_classes([SuperuserAccess])
def executions(request):
    query = ExecutionQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    data = query.validated_data
    qs = RoutineExecution.objects.defer("log")
    if data["routine"]:
        qs = qs.filter(routine_id=data["routine"])
    if data["status"]:
        qs = qs.filter(status=data["status"])
    start = (data["page"] - 1) * data["page_size"]
    counts = {row["status"]: row["count"] for row in RoutineExecution.objects.values("status").annotate(count=Count("id"))}
    return respond({"count": qs.count(), "results": ExecutionSerializer(qs[start:start + data["page_size"]], many=True).data,
                    "summary": {key: counts.get(key, 0) for key in RoutineExecution.Status.values},
                    "can_view_logs": diagnostics_allowed(request.user)})


@api_view(["GET"])
@permission_classes([SuperuserAccess])
def execution_detail(request, pk):
    # Keep the same gate as the existing technical log viewer.
    if not diagnostics_allowed(request.user):
        return respond({"detail": "Diagnóstico técnico indisponível para este usuário."}, status=404)
    execution = get_object_or_404(RoutineExecution, pk=pk)
    audit_log(request, action="routine.log_viewed", resource_type="routine_execution", resource_id=execution.pk)
    return respond({**ExecutionSerializer(execution).data, "log": execution.log})
