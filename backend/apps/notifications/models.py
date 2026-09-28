from django.conf import settings
from django.db import models


class AdminNotification(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        SCHEDULED = "scheduled", "Agendada"
        PUBLISHED = "published", "Publicada"
        CLOSED = "closed", "Encerrada"
        ARCHIVED = "archived", "Arquivada"
    class Scope(models.TextChoices):
        ALL = "all", "Todos os usuários ativos"
        SELECTED = "selected_users", "Usuários selecionados"
        SEGMENT = "segment", "Segmento de assinatura"
    class Priority(models.TextChoices):
        INFO = "info", "Informativo"
        MAINTENANCE = "maintenance", "Manutenção"
        NEWS = "news", "Novidade"
        URGENT = "urgent", "Urgente"
        REQUIRED = "required", "Obrigatório"
    title = models.CharField(max_length=160)
    summary = models.CharField(max_length=280, blank=True)
    body = models.TextField(blank=True)
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.INFO)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True)
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.SELECTED)
    segment_plan_slug = models.SlugField(blank=True)
    segment_subscription_status = models.CharField(max_length=20, blank=True)
    image_url = models.URLField(blank=True)
    video_url = models.URLField(blank=True)
    links = models.JSONField(default=list, blank=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    postpone_hours = models.PositiveSmallIntegerField(default=24)
    max_postpones = models.PositiveSmallIntegerField(default=3)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="created_admin_notifications")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="updated_admin_notifications")
    published_at = models.DateTimeField(null=True, blank=True)
    closure_reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ["-updated_at"]


class NotificationRecipient(models.Model):
    class State(models.TextChoices):
        PENDING = "pending", "Pendente"
        VIEWED = "viewed", "Visualizado"
        POSTPONED = "postponed", "Adiado"
        DISMISSED = "dismissed", "Dispensado"
    notification = models.ForeignKey(AdminNotification, on_delete=models.CASCADE, related_name="recipients")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="admin_notification_recipients")
    source = models.CharField(max_length=20, default="selected")
    state = models.CharField(max_length=16, choices=State.choices, default=State.PENDING, db_index=True)
    first_shown_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    next_reminder_at = models.DateTimeField(null=True, blank=True)
    postpone_count = models.PositiveSmallIntegerField(default=0)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["notification", "user"], name="unique_admin_notification_recipient")]
        indexes = [models.Index(fields=["notification", "state"]) ]


class NotificationCategory(models.TextChoices):
    STUDIES = "studies", "Estudos"
    QUESTIONS = "questions", "Questões & simulados"
    FEEDBACK = "feedback", "Feedback"
    BILLING = "billing", "Assinatura & pagamento"
    CONCURSOS = "concursos", "Concursos & notícias"
    COMMUNITY = "community", "Comunidade"


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    category = models.CharField(max_length=16, choices=NotificationCategory.choices, db_index=True)
    title = models.CharField(max_length=120)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    metadata = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_on = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"], name="notif_user_read_idx"),
            models.Index(fields=["user", "-created_at"], name="notif_user_created_idx"),
        ]

    def __str__(self):
        return f"{self.category}: {self.title}"


class NotificationPreference(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preferences")
    category = models.CharField(max_length=16, choices=NotificationCategory.choices)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "category"],
                name="unique_notification_pref_per_category",
            )
        ]

    def __str__(self):
        return f"{self.user}: {self.category} {'on' if self.enabled else 'off'}"