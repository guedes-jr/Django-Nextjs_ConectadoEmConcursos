from rest_framework.throttling import SimpleRateThrottle
from .diagnostics import limit_setting


class DiagnosticsThrottle(SimpleRateThrottle):
    scope = "diagnostics"

    def get_rate(self):
        return f"{limit_setting('DIAGNOSTICS_REQUESTS_PER_MINUTE', 60, 1, 600)}/min"

    def get_cache_key(self, request, view):
        if not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class DiagnosticRoutineThrottle(DiagnosticsThrottle):
    scope = "diagnostic_routine"

    def get_rate(self):
        return f"{limit_setting('DIAGNOSTICS_ROUTINES_PER_MINUTE', 6, 1, 30)}/min"

    def get_cache_key(self, request, view):
        return super().get_cache_key(request, view) if request.method == "POST" else None
