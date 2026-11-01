"""Fixed operational routines, durable scheduling and bounded, redacted run logs."""
import logging
import threading
import time
import traceback
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management import call_command
from django.db import transaction
from django.utils import timezone

from .audit import log as audit_log
from .backup_storage import operation_lock
from .diagnostics import _entry
from .models import OperationalRoutine, RoutineExecution, RoutineSchedule

CATALOG = {
    "publish_notifications": {"title": "Publicar avisos agendados", "command": "publish_scheduled_notifications", "timeout": 300},
    "publish_news": {"title": "Publicar artigos agendados", "command": "publish_scheduled_news", "timeout": 300},
    "backup": {"title": "Backup de banco e mídia", "command": "backup_db", "timeout": 900},
}
TIMEZONES = ["America/Fortaleza", "America/Sao_Paulo", "UTC"]
LOG_LIMIT = 65536


def next_run(schedule, now):
    if schedule.frequency == "interval":
        return now + timedelta(minutes=schedule.interval_minutes)
    zone = ZoneInfo(schedule.timezone_name)
    local = now.astimezone(zone)
    candidate = datetime.combine(local.date(), schedule.time_of_day, tzinfo=zone)
    if candidate <= local:
        candidate += timedelta(days=1)
    return candidate


class RunLog:
    def __init__(self):
        self.text = ""
        self.truncated = False

    def write(self, value):
        value = str(value)
        self.text += value[:LOG_LIMIT * 2]
        if len(value) > LOG_LIMIT * 2 or len(self.text) > LOG_LIMIT * 2:
            self.truncated = True
            self.text = self.text[:LOG_LIMIT * 2]
        return len(value)

    def flush(self):
        pass

    def result(self):
        clean = "\n".join(_entry(line.encode())["text"] for line in self.text.splitlines())
        raw = clean.encode()
        truncated = self.truncated or len(raw) > LOG_LIMIT
        return raw[:LOG_LIMIT].decode(errors="ignore"), truncated


@contextmanager
def capture_logs(output):
    owner = threading.get_ident()

    class Handler(logging.Handler):
        def emit(self, record):
            if record.thread == owner:
                output.write(self.format(record) + "\n")

    handler = Handler()
    handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.addHandler(handler)
    try:
        yield
    finally:
        root.removeHandler(handler)


def claim(schedule_id, now):
    with transaction.atomic():
        initial = RoutineSchedule.objects.get(pk=schedule_id)
        OperationalRoutine.objects.select_for_update().get(pk=initial.routine_id)
        schedule = RoutineSchedule.objects.select_for_update().get(pk=schedule_id)
        if not schedule.enabled or schedule.next_run_at > now:
            return None
        running = RoutineExecution.objects.filter(routine_id=schedule.routine_id, status="running")
        if running.filter(status="running").exists():
            return None
        execution = RoutineExecution.objects.create(schedule=schedule, routine_id=schedule.routine_id,
            schedule_name=schedule.name, scheduled_for=schedule.next_run_at, started_at=now)
        schedule.next_run_at = next_run(schedule, now)
        schedule.save(update_fields=["next_run_at"])
        return execution


def execute(execution):
    output = RunLog()
    started = time.monotonic()
    success = False
    try:
        with capture_logs(output):
            call_command(CATALOG[execution.routine_id]["command"], stdout=output, stderr=output, no_color=True)
        success = True
    except Exception:
        output.write(traceback.format_exc())
    clean, truncated = output.result()
    with transaction.atomic():
        execution.status = "success" if success else "error"
        execution.finished_at = timezone.now()
        execution.duration_ms = max(0, int((time.monotonic() - started) * 1000))
        execution.log, execution.log_truncated = clean, truncated
        execution.save(update_fields=["status", "finished_at", "duration_ms", "log", "log_truncated"])
        audit_log(action="routine.completed" if success else "routine.failed", resource_type="routine_execution",
                  resource_id=execution.pk, after={"routine": execution.routine_id, "status": execution.status,
                                                  "duration_ms": execution.duration_ms})
    return success


def recover_stale(key, now):
    with transaction.atomic():
        routine = OperationalRoutine.objects.select_for_update().get(pk=key)
        cutoff = now - timedelta(seconds=CATALOG[key]["timeout"] + 60)
        for stale in RoutineExecution.objects.filter(routine_id=key, status="running", started_at__lt=cutoff):
            stale.status, stale.finished_at = "interrupted", now
            stale.duration_ms = max(0, int((now - stale.started_at).total_seconds() * 1000))
            stale.log = (stale.log + "\nExecução interrompida: o executor não registrou conclusão dentro do prazo. Consulte o journal do serviço.")[:LOG_LIMIT]
            stale.save(update_fields=["status", "finished_at", "duration_ms", "log"])
            audit_log(action="routine.interrupted", resource_type="routine_execution", resource_id=stale.pk,
                      after={"routine": key, "status": "interrupted"})
        routine.last_tick_at = now
        routine.save(update_fields=["last_tick_at"])


def dispatch(routine_keys=None):
    keys = list(routine_keys or CATALOG)
    if set(keys) - CATALOG.keys():
        raise ValueError("Rotina não permitida.")
    results = {"success": 0, "error": 0, "busy": 0}
    for key in keys:
        directory = Path(settings.BACKUP_DIR) / ".routines" / key
        try:
            with operation_lock(directory):
                recover_stale(key, timezone.now())
                due = list(RoutineSchedule.objects.filter(enabled=True, routine_id=key, next_run_at__lte=timezone.now())
                           .order_by("next_run_at", "id").values_list("id", flat=True)[:50])
                for schedule_id in due:
                    execution = claim(schedule_id, timezone.now())
                    if execution:
                        results["success" if execute(execution) else "error"] += 1
        except ValueError as exc:
            if "Já existe uma operação" not in str(exc):
                raise
            results["busy"] += 1
    return results
