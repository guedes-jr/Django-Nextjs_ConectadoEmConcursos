from django.http import JsonResponse
from django.views.decorators.http import require_safe

@require_safe
def health(request):
    response = JsonResponse({"status": "ok"})
    response["Cache-Control"] = "no-store"
    return response


@require_safe
def readiness(request):
    from .readiness import check_readiness

    try:
        check_readiness()
    except Exception:
        # Never expose database errors, hosts, credentials or provider responses.
        response = JsonResponse({"status": "unavailable"}, status=503)
    else:
        response = JsonResponse({"status": "ready"})
    response["Cache-Control"] = "no-store"
    return response
