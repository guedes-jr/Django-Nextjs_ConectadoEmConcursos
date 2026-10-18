"""Safe correlation and bounded metadata for HTTP failures; no payloads or query strings."""
import json
import logging
import time
from uuid import UUID, uuid4

logger = logging.getLogger("conectado.errors")


class RequestObservabilityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            request_id = str(UUID(request.headers.get("X-Request-ID", "")))
        except (ValueError, TypeError, AttributeError):
            request_id = str(uuid4())
        request.request_id = request_id
        started = time.monotonic()
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        if response.status_code >= 500:
            route = getattr(getattr(request, "resolver_match", None), "route", None)
            logger.error(json.dumps({"event": "http.server_error", "request_id": request_id,
                                     "method": request.method[:16], "route": route[:240] if route else None, "status": response.status_code,
                                     "duration_ms": round((time.monotonic() - started) * 1000)}))
        return response
