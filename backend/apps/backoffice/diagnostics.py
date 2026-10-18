"""Bounded, read-only diagnostic collectors. No user-supplied executable code."""
from contextlib import contextmanager
from datetime import datetime
import hashlib
import inspect
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import time

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.db import connection, transaction, DatabaseError
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError

from .audit import redact
from .models import AuditEvent


def limit_setting(name, default, minimum, maximum):
    return max(minimum, min(maximum, int(getattr(settings, name, default))))


def _open_regular(path):
    if Path(path).is_symlink():
        raise OSError("Symbolic links are not diagnostic inputs")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise OSError("Not a regular file")
        return os.fdopen(fd, "rb")
    except Exception:
        os.close(fd)
        raise


def allowed_logs():
    items = []
    for configured in settings.DIAGNOSTICS_LOG_FILES:
        path = Path(configured).expanduser().absolute()
        # Opaque identifiers distinguish files with the same basename.
        identifier = hashlib.sha256(str(path).encode()).hexdigest()[:20]
        try:
            with _open_regular(path):
                available = True
        except OSError:
            available = False
        items.append({"id": identifier, "name": path.name, "path": path, "available": available})
    return items


class LogQuery(serializers.Serializer):
    service = serializers.CharField(max_length=64, required=False, default="")
    page = serializers.IntegerField(min_value=1, max_value=10000, default=1)
    limit = serializers.IntegerField(min_value=1, max_value=200, default=100)
    lines = serializers.IntegerField(min_value=1, max_value=200, required=False)
    q = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    severity = serializers.ChoiceField(choices=["", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"], default="")
    request_id = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    since = serializers.DateTimeField(required=False, allow_null=True)
    until = serializers.DateTimeField(required=False, allow_null=True)
    snapshot = serializers.CharField(max_length=2048, required=False, allow_blank=True, default="")
    export = serializers.ChoiceField(choices=["", "txt"], default="")

    def validate(self, attrs):
        if attrs.get("since") and attrs.get("until") and attrs["since"] >= attrs["until"]:
            raise serializers.ValidationError({"until": "Informe término posterior ao início."})
        if attrs["page"] > 1 and not attrs["snapshot"]:
            raise serializers.ValidationError({"snapshot": "Abra a primeira página antes de continuar."})
        return attrs


_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?")
_LEVEL = re.compile(r"\b(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL|FATAL)\b", re.I)
_CORRELATION = re.compile(r"(?:request_id|correlation_id)[\"']?\s*[=:]\s*[\"']?([A-Za-z0-9._-]+)", re.I)
_QUOTED_SECRET = re.compile(r'''(?i)((?:password|token|secret|authorization|cookie|api[_-]?key)["']?\s*[=:]\s*)(["'])(.*?)\2''')
_HEADER_SECRET = re.compile(r"(?i)\b(authorization|cookie|set-cookie)\s*:\s*[^\r\n]+")


def _date(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = parse_datetime(value.replace(",", "."))
        return timezone.make_aware(parsed) if parsed and timezone.is_naive(parsed) else parsed
    except (ValueError, OverflowError):
        return None


def _entry(raw):
    text = raw[:8192].decode("utf-8", errors="replace")
    try:
        record = json.loads(text)
    except (ValueError, TypeError, RecursionError):
        record = None
    if isinstance(record, dict):
        context = record.get("context") if isinstance(record.get("context"), dict) else {}
        timestamp = _date(record.get("timestamp") or record.get("time") or record.get("asctime") or record.get("created_at"))
        level = record.get("level") or record.get("levelname") or record.get("severity") or ""
        level = level.upper() if isinstance(level, str) else ""
        correlation = record.get("request_id") or record.get("correlation_id") or context.get("request_id") or ""
        correlation = correlation if isinstance(correlation, str) and re.fullmatch(r"[A-Za-z0-9._-]{1,128}", correlation) else ""
        try:
            clean = json.dumps(redact(record), ensure_ascii=False)
        except RecursionError:
            clean = "[Linha estruturada profunda omitida]"
    else:
        match = _TIMESTAMP.search(text)
        timestamp = _date(match.group()) if match else None
        level_match = _LEVEL.search(text)
        level = level_match.group().upper() if level_match else ""
        match = _CORRELATION.search(text)
        correlation = match.group(1) if match else ""
        clean = redact(_HEADER_SECRET.sub(r"\1: [redigido]", _QUOTED_SECRET.sub(r"\1[redigido]", text)))
    if level not in {"DEBUG", "INFO", "WARNING", "WARN", "ERROR", "CRITICAL", "FATAL"}:
        level = ""
    if len(raw) > 8192:
        clean = "[Linha longa omitida para respeitar o limite de leitura]"
    return {"timestamp": timestamp, "severity": {"WARN": "WARNING", "FATAL": "CRITICAL"}.get(level, level),
            "request_id": correlation[:128], "text": clean[:2000] + (" … [linha limitada]" if len(raw) > 8192 or len(clean) > 2000 else "")}


def read_log(item, query):
    max_bytes = limit_setting("DIAGNOSTICS_LOG_MAX_BYTES", 1048576, 4096, 4194304)
    max_lines = limit_setting("DIAGNOSTICS_LOG_MAX_LINES", 5000, 100, 10000)
    try:
        with _open_regular(item["path"]) as source:
            info = os.fstat(source.fileno())
            identity = [info.st_dev, info.st_ino]
            token = query["snapshot"]
            if token:
                try:
                    snapshot = signing.loads(token, salt="diagnostic-log", max_age=300)
                except signing.BadSignature:
                    raise ValidationError({"snapshot": "A janela expirou; atualize a primeira página."}) from None
                if snapshot.get("id") != item["id"] or snapshot.get("file") != identity or snapshot.get("end", 0) > info.st_size:
                    raise ValidationError({"snapshot": "O log foi rotacionado; atualize a primeira página."})
                start, end = snapshot["start"], snapshot["end"]
                if not (0 <= start <= end <= info.st_size and end-start <= max_bytes):
                    raise ValidationError({"snapshot": "Janela inválida; atualize a primeira página."})
            else:
                end = info.st_size
                start = max(0, end-max_bytes)
                snapshot = {"id": item["id"], "file": identity, "start": start, "end": end}
            source.seek(start)
            raw = source.read(end-start)
            digest = hashlib.sha256(raw).hexdigest()
            if token and snapshot.get("digest") != digest:
                raise ValidationError({"snapshot": "O conteúdo do log mudou; atualize a primeira página."})
            if not token:
                token = signing.dumps({**snapshot, "digest": digest}, salt="diagnostic-log", compress=True)
    except OSError:
        raise NotFound("Log indisponível.") from None
    chunks = raw.rsplit(b"\n", max_lines+1)
    if chunks and chunks[-1] == b"":
        chunks.pop()
    too_many = len(chunks) > max_lines
    limited = start > 0 or too_many
    if too_many:
        chunks = chunks[-max_lines:]
    elif start > 0:
        chunks = chunks[1:]  # Discard a partial line at the left boundary.
    matches = []
    for chunk in reversed(chunks):
        if not chunk:
            continue
        entry = _entry(chunk)
        if query["severity"] and entry["severity"] != query["severity"]:
            continue
        if query["request_id"] and entry["request_id"] != query["request_id"]:
            continue
        if query.get("since") and (not entry["timestamp"] or entry["timestamp"] < query["since"]):
            continue
        if query.get("until") and (not entry["timestamp"] or entry["timestamp"] > query["until"]):
            continue
        if query["q"].casefold() not in entry["text"].casefold():
            continue
        matches.append(entry)
    page, size = query["page"], query.get("lines", query["limit"])
    export = query["export"] == "txt"
    export_limit = limit_setting("DIAGNOSTICS_LOG_EXPORT_LINES", 500, 1, 1000)
    rows = matches[:export_limit] if export else matches[(page-1)*size:page*size]
    if export:
        byte_limit = limit_setting("DIAGNOSTICS_LOG_EXPORT_MAX_BYTES", 262144, 4096, 1048576)
        used = 0
        bounded = []
        for row in rows:
            used += len(row["text"].encode())+1
            if used > byte_limit:
                break
            bounded.append(row)
        rows = bounded
    return {"service": item["id"], "name": item["name"], "lines": [row["text"] for row in rows], "entries": rows,
            "total": len(matches), "page": page, "limit": size, "snapshot": token, "bytes_read": len(raw),
            "window_limited": limited, "export_limited": export and len(matches) > len(rows)}


@contextmanager
def read_only_queries():
    """Bound the fixed collectors and reject ORM writes at the database layer."""
    budget_ms = limit_setting("DIAGNOSTICS_QUERY_TIMEOUT_MS", 3000, 100, 10000)
    connection.ensure_connection()
    if connection.vendor == "sqlite":
        deadline = time.monotonic() + budget_ms/1000
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("PRAGMA query_only")
                previous = cursor.fetchone()[0]
                cursor.execute("PRAGMA query_only=ON")
            connection.connection.set_progress_handler(lambda: int(time.monotonic() >= deadline), 1000)
            try:
                yield
            finally:
                connection.connection.set_progress_handler(None, 0)
                # Restore even if an attempted ORM write marked the savepoint
                # for rollback; cleanup must precede Django's rollback.
                connection.connection.execute(f"PRAGMA query_only={int(previous)}")
    elif connection.vendor == "postgresql":
        nested = connection.in_atomic_block
        deadline = time.monotonic() + budget_ms/1000
        with transaction.atomic():
            with connection.cursor() as cursor:
                if not nested:
                    cursor.execute("SET TRANSACTION READ ONLY")
                cursor.execute("SHOW statement_timeout")
                previous = cursor.fetchone()[0]
                cursor.execute("SELECT set_config('statement_timeout', %s, true)", [str(budget_ms)])
            def select_only(execute, sql, params, many, context):
                if not isinstance(sql, str) or not sql.strip() or sql.lstrip().split(None, 1)[0].upper() not in {"SELECT", "SHOW"}:
                    raise DatabaseError("Diagnostic collectors are read-only")
                remaining = int((deadline-time.monotonic())*1000)
                if remaining <= 0:
                    raise DatabaseError("Diagnostic query budget exceeded")
                execute("SELECT set_config('statement_timeout', %s, true)", [str(remaining)], False, context)
                return execute(sql, params, many, context)
            with connection.execute_wrapper(select_only):
                yield
            with connection.cursor() as cursor:
                cursor.execute("SELECT set_config('statement_timeout', %s, true)", [previous])
    else:
        raise DatabaseError("Diagnostic collectors are unsupported on this database")


def database_snapshot():
    result = {"vendor": connection.vendor, "version": None, "connected": False, "latency_ms": None,
              "active_connections": None, "size": None, "pending_migrations": None,
              "slow_queries": {"available": False, "detail": "Estatísticas agregadas não disponíveis neste banco."}}
    started = time.monotonic()
    try:
        with read_only_queries():
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result["latency_ms"] = round((time.monotonic()-started)*1000, 2)
                result["connected"] = True
                if connection.vendor == "sqlite":
                    cursor.execute("SELECT sqlite_version()")
                    result["version"] = cursor.fetchone()[0]
                    cursor.execute("PRAGMA page_count")
                    pages = cursor.fetchone()[0]
                    cursor.execute("PRAGMA page_size")
                    result["size"] = pages*cursor.fetchone()[0]
                elif connection.vendor == "postgresql":
                    cursor.execute("SHOW server_version")
                    result["version"] = cursor.fetchone()[0]
                    cursor.execute("SELECT pg_database_size(current_database())")
                    result["size"] = cursor.fetchone()[0]
                    cursor.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()")
                    result["active_connections"] = cursor.fetchone()[0]
            executor = MigrationExecutor(connection)
            result["pending_migrations"] = len(executor.migration_plan(executor.loader.graph.leaf_nodes()))
            if connection.vendor == "postgresql" and getattr(settings, "DIAGNOSTICS_SLOW_QUERY_STATS", False):
                with connection.cursor() as cursor:
                    cursor.execute("SELECT to_regclass('pg_stat_statements')")
                    if cursor.fetchone()[0]:
                        cursor.execute("SELECT COALESCE(SUM(calls),0), COALESCE(MAX(mean_exec_time),0), COALESCE(SUM(total_exec_time),0) FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())")
                        calls, slowest_mean, total = cursor.fetchone()
                        result["slow_queries"] = {"available": True, "calls": int(calls), "slowest_mean_ms": float(slowest_mean), "total_exec_ms": float(total), "detail": "Agregados de pg_stat_statements; texto e parâmetros das consultas não são retornados."}
    except (DatabaseError, OSError):
        result["detail"] = "Não foi possível concluir a coleta do banco dentro dos limites configurados."
    if result["latency_ms"] is None:
        result["latency_ms"] = round((time.monotonic()-started)*1000, 2)
    return result


def service_snapshot():
    result = {"django": {"status": "ok", "detail": "Processo Django respondeu.", "checked_at": timezone.now()}}
    external = ("worker", "scheduler", "frontend", "proxy")
    raw = {}
    path = getattr(settings, "DIAGNOSTICS_HEALTH_FILE", "")
    if path:
        try:
            with _open_regular(Path(path)) as source:
                encoded = source.read(65537)
            raw = json.loads(encoded) if len(encoded) <= 65536 else {}
            if not isinstance(raw, dict):
                raw = {}
        except (OSError, ValueError, UnicodeError, RecursionError):
            raw = {}
    now = timezone.now()
    max_age = limit_setting("DIAGNOSTICS_HEALTH_MAX_AGE_SECONDS", 300, 10, 3600)
    for name in external:
        entry = raw.get(name)
        if not isinstance(entry, dict):
            result[name] = {"status": "unavailable" if path else "not_configured", "detail": "Estado externo indisponível." if path else "Configure a coleta de saúde na infraestrutura."}
            continue
        checked = _date(entry.get("checked_at"))
        state = entry.get("status")
        valid = isinstance(state, str) and state in {"ok", "degraded", "down"} and checked and -30 <= (now-checked).total_seconds() <= max_age
        value = {"status": state if valid else "stale", "checked_at": checked, "detail": "Estado informado pela infraestrutura." if valid else "Estado expirado ou inválido; atualize a coleta externa."}
        for key in ("latency_ms", "failures_recent"):
            metric = entry.get(key)
            if isinstance(metric, (float, int)) and not isinstance(metric, bool) and 0 <= metric <= 1000000:
                value[key] = metric
        value["started_at"] = _date(entry.get("started_at"))
        result[name] = value
    result["host"] = {"load_average": os.getloadavg() if hasattr(os, "getloadavg") else None, "pid": os.getpid()}
    return result


def overview_snapshot():
    disk = shutil.disk_usage(settings.BASE_DIR)
    capacity = {"cpu_percent": None, "memory_total": None, "memory_used": None, "process_memory_peak": None}
    try:
        import psutil
        memory = psutil.virtual_memory()
        capacity.update(cpu_percent=psutil.cpu_percent(interval=None), memory_total=memory.total, memory_used=memory.used)
    except ImportError:
        try:
            import resource
            peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            capacity["process_memory_peak"] = peak if platform.system() == "Darwin" else peak*1024
        except ImportError:
            pass
    return {"application": {"python": platform.python_version(), "version": getattr(settings, "DIAGNOSTICS_APP_VERSION", "") or None, "environment": os.getenv("DJANGO_ENV", "unknown"), "time": timezone.now()},
            "storage": {"total": disk.total, "used": disk.used, "free": disk.free}, "capacity": capacity,
            "database": database_snapshot(), "limits": {"query_timeout_ms": limit_setting("DIAGNOSTICS_QUERY_TIMEOUT_MS", 3000, 100, 10000),
            "log_max_bytes": limit_setting("DIAGNOSTICS_LOG_MAX_BYTES", 1048576, 4096, 4194304),
            "result_max_bytes": limit_setting("DIAGNOSTICS_RESULT_MAX_BYTES", 32768, 1024, 65536)}}


def _summary_counts():
    from apps.billing.models import Subscription
    from apps.questions.models import Question
    return {"users": get_user_model().objects.count(), "active_subscriptions": Subscription.objects.filter(status="active").count(),
            "questions_pending": Question.objects.filter(status="pending").count(), "audit_events": AuditEvent.objects.count()}


def _recent_failures():
    return list(AuditEvent.objects.filter(action__icontains="failed").values("id", "action", "resource_type", "created_at").order_by("-created_at")[:50])


ROUTINES = {
    "summary-counts": {"title": "Contagens resumidas", "description": "Contagens operacionais agregadas.", "run": _summary_counts},
    "recent-failures": {"title": "Falhas recentes", "description": "Até 50 eventos de falha, sem dados sensíveis.", "run": _recent_failures},
}


def routine_hash(routine):
    return hashlib.sha256(inspect.getsource(routine["run"]).encode()).hexdigest()


def run_routine(identifier):
    routine = ROUTINES.get(identifier)
    if routine is None:
        raise ValidationError({"script": "Rotina não permitida."})
    started = time.monotonic()
    with read_only_queries():
        result = redact(routine["run"]())
    budget = limit_setting("DIAGNOSTICS_RESULT_MAX_BYTES", 32768, 1024, 65536)
    encoded = json.dumps(result, ensure_ascii=False).encode()
    truncated = len(encoded) > budget
    if truncated:
        result = {"detail": "O resultado excedeu o limite de saída.", "truncated": True}
    return {"script": identifier, "mode": "read_only", "script_hash": routine_hash(routine),
            "elapsed_ms": round((time.monotonic()-started)*1000, 2), "result": result, "truncated": truncated}
