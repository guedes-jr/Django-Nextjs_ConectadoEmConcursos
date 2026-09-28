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


class UserManagementMeta(models.Model):
    """Metadados internos do backoffice; nunca expostos ao usuário final."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="management_meta")
    internal_notes = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    block_reason = models.CharField(max_length=500, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_user_management_meta")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Metadados de gestão de usuário"
        verbose_name_plural = "Metadados de gestão de usuários"
