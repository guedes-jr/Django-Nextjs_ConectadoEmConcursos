from datetime import date, datetime
from uuid import UUID

from .models import AuditEvent

SENSITIVE_KEYS = {"password", "token", "secret", "authorization", "cookie", "card", "cvv", "api_key"}


def redact(value):
    if isinstance(value, (datetime, date, UUID)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: ("[redigido]" if any(word in key.lower() for word in SENSITIVE_KEYS) else redact(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def log(request, *, action, resource_type, resource_id="", before=None, after=None, reason="", context=None):
    request_id = request.headers.get("X-Request-ID") if request else None
    try:
        request_id = UUID(request_id) if request_id else None
    except (TypeError, ValueError):
        request_id = None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "") if request else ""
    ip = (forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR")) if request else None
    return AuditEvent.objects.create(actor=getattr(request, "user", None), action=action, resource_type=resource_type, resource_id=str(resource_id), before=redact(before or {}), after=redact(after or {}), reason=str(reason)[:500], context=redact(context or {}), ip_address=ip, user_agent=(request.META.get("HTTP_USER_AGENT", "")[:500] if request else ""), request_id=request_id)
