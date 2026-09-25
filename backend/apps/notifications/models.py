from django.conf import settings
from django.db import models


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