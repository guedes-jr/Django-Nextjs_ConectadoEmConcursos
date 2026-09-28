from django.conf import settings
from django.db import models


class AuditEvent(models.Model):
    """Registro append-only de ações administrativas, sem segredos."""
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_events")
    action = models.CharField(max_length=80, db_index=True)
    resource_type = models.CharField(max_length=80, db_index=True)
    resource_id = models.CharField(max_length=80, blank=True, db_index=True)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    context = models.JSONField(default=dict, blank=True)
    reason = models.CharField(max_length=500, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    request_id = models.UUIDField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["resource_type", "resource_id", "-created_at"])]
        permissions = [("view_financial_reports", "Pode visualizar indicadores financeiros")]

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Eventos de auditoria são imutáveis.")
        return super().save(*args, **kwargs)
