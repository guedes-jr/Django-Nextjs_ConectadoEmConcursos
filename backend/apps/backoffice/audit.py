"""Audit events and isolated execution context for HTTP, commands and jobs."""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime
from decimal import Decimal
from functools import wraps
from ipaddress import ip_address
import logging
import json
import re
from uuid import UUID, uuid4

from .models import AuditEvent

logger = logging.getLogger(__name__)
_scope = ContextVar("audit_scope", default=None)
SENSITIVE_KEYS = {"password", "token", "secret", "authorization", "cookie", "card", "cvv", "apikey", "credential", "privatekey", "sessionid"}
_SECRET_VALUE = re.compile(r"(?i)(password|token|secret|authorization|cookie|api[_-]?key|credential)([\s\"']*[=:][\s\"']*)([^\s&,;\"']+)")
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")


def redact(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, dict):
        return {key: ("[redigido]" if any(word in re.sub(r"[^a-z0-9]", "", str(key).lower()) for word in SENSITIVE_KEYS) else redact(item)) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return _SECRET_VALUE.sub(r"\1\2[redigido]", _BEARER.sub("Bearer [redigido]", value))
    return value


@contextmanager
def audit_context(*, request=None, actor=None, **context):
    parent = _scope.get() or {}
    token = _scope.set({"request": request or parent.get("request"), "actor": actor or parent.get("actor"), "context": {**parent.get("context", {}), **context}})
    try:
        yield
    finally:
        _scope.reset(token)


def log(request=None, *, actor=None, action, resource_type, resource_id="", before=None, after=None, reason="", context=None):
    scope = _scope.get() or {}
    request = request or scope.get("request")
    actor = actor or (getattr(request, "user", None) if request else None) or scope.get("actor")
    if actor is not None and not getattr(actor, "is_authenticated", False):
        actor = None
    context = {"origin": "http" if request else "service", **scope.get("context", {}), **(context or {})}
    request_id = (getattr(request, "request_id", None) or request.headers.get("X-Request-ID")) if request else None
    try:
        request_id = UUID(request_id) if request_id else None
    except (TypeError, ValueError):
        request_id = None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "") if request else ""
    ip = (forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR")) if request else None
    try:
        ip = str(ip_address(ip)) if ip else None
    except ValueError:
        ip = None
    return AuditEvent.objects.create(
        actor=actor, action=action, resource_type=resource_type, resource_id=redact(str(resource_id)),
        before=redact(before or {}), after=redact(after or {}), reason=redact(str(reason))[:500],
        context=redact(context), ip_address=ip,
        user_agent=redact(request.META.get("HTTP_USER_AGENT", ""))[:500] if request else "",
        request_id=request_id,
    )


@contextmanager
def operation(action, *, resource_type, resource_id="", request=None, origin=None, context=None):
    """Lifecycle without copying command arguments, file contents or exceptions."""
    parent_id = ((_scope.get() or {}).get("context") or {}).get("operation_id")
    metadata = {"operation_id": str(uuid4()), **({"parent_operation_id": parent_id} if parent_id else {}), **(context or {})}
    if origin:
        metadata["origin"] = origin
    with audit_context(request=request, **metadata):
        log(action=f"{action}.started", resource_type=resource_type, resource_id=resource_id)
        result = {}
        try:
            yield result
        except Exception as exc:
            try:
                log(action=f"{action}.failed", resource_type=resource_type, resource_id=resource_id, context={"error_type": type(exc).__name__})
            except Exception:
                # Preserve the original error even if the database is unavailable.
                logger.error("Unable to persist audit failure for %s (%s).", action, type(exc).__name__)
            raise
        else:
            log(action=f"{action}.completed", resource_type=resource_type, resource_id=resource_id, after=result)


def audited_command(name):
    def decorate(handle):
        @wraps(handle)
        def wrapped(self, *args, **options):
            with operation(f"command.{name}", resource_type="command", resource_id=name,
                           origin=f"command:{name}", context={"dry_run": bool(options.get("dry_run"))}):
                return handle(self, *args, **options)
        return wrapped
    return decorate


def snapshot_diff(before, after):
    """Changed fields only, with missing values distinct from JSON null."""
    before, after = redact(before), redact(after)
    changes = []

    def walk(left, right, path):
        for key in sorted(set(left) | set(right)):
            old_present, new_present = key in left, key in right
            old, new = left.get(key), right.get(key)
            field = f"{path}.{key}" if path else str(key)
            if old_present and new_present and isinstance(old, dict) and isinstance(new, dict):
                walk(old, new, field)
            elif not (old_present and new_present and json.dumps(old, sort_keys=True) == json.dumps(new, sort_keys=True)):
                changes.append({"path": field, "kind": "added" if not old_present else "removed" if not new_present else "changed",
                                "before": old, "after": new, "before_present": old_present, "after_present": new_present})
    walk(before, after, "")
    return changes



def audit_request(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        with audit_context(request=request):
            return view(request, *args, **kwargs)
    return wrapped


def audited_job(name):
    def decorate(job):
        @wraps(job)
        def wrapped(*args, **kwargs):
            with operation(f"job.{name}", resource_type="job", resource_id=name, origin=f"job:{name}"):
                return job(*args, **kwargs)
        return wrapped
    return decorate
