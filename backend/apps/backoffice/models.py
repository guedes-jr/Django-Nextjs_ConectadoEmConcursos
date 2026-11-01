from django.conf import settings
from django.db import models
from django.utils import timezone


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
        permissions = [
            ("view_financial_reports", "Pode visualizar indicadores financeiros"),
            ("access_diagnostics", "Pode acessar diagnóstico técnico"),
        ]

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


class SMTPConfiguration(models.Model):
    """Configuração única do transporte transacional, sem expor a credencial."""
    host = models.CharField(max_length=255)
    port = models.PositiveIntegerField(default=587)
    username = models.CharField(max_length=255, blank=True)
    password_encrypted = models.TextField(blank=True)
    use_tls = models.BooleanField(default=True)
    use_ssl = models.BooleanField(default=False)
    from_email = models.EmailField()
    enabled = models.BooleanField(default=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_smtp_configurations")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração SMTP"
        verbose_name_plural = "Configurações SMTP"


class OperationalRoutine(models.Model):
    """Stable row used to serialize claims for a code-defined routine."""
    key = models.CharField(max_length=64, primary_key=True)
    last_tick_at = models.DateTimeField(null=True, blank=True)


class RoutineSchedule(models.Model):
    class Frequency(models.TextChoices):
        INTERVAL = "interval", "A cada intervalo"
        DAILY = "daily", "Diariamente"

    routine = models.ForeignKey(OperationalRoutine, on_delete=models.PROTECT)
    name = models.CharField(max_length=120)
    enabled = models.BooleanField(default=True)
    frequency = models.CharField(max_length=12, choices=Frequency.choices)
    interval_minutes = models.PositiveIntegerField(default=60)
    time_of_day = models.TimeField(default="03:15")
    timezone_name = models.CharField(max_length=64, default="America/Fortaleza")
    next_run_at = models.DateTimeField(db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["id"]


class RoutineExecution(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "Em execução"
        SUCCESS = "success", "Sucesso"
        ERROR = "error", "Erro"
        INTERRUPTED = "interrupted", "Interrompida"

    schedule = models.ForeignKey(RoutineSchedule, on_delete=models.PROTECT, related_name="executions")
    routine = models.ForeignKey(OperationalRoutine, on_delete=models.PROTECT)
    schedule_name = models.CharField(max_length=120)
    scheduled_for = models.DateTimeField()
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING, db_index=True)
    duration_ms = models.PositiveBigIntegerField(null=True)
    log = models.TextField(blank=True)
    log_truncated = models.BooleanField(default=False)

    class Meta:
        ordering = ["-started_at", "-id"]
        indexes = [models.Index(fields=["-started_at", "-id"], name="routine_exec_recent"),
                   models.Index(fields=["routine", "status", "-started_at"], name="routine_exec_status")]
        constraints = [models.UniqueConstraint(fields=["schedule", "scheduled_for"], name="routine_execution_once")]
