from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    state = models.CharField(max_length=2, blank=True)
    city = models.CharField(max_length=100, blank=True)
    profession = models.CharField(max_length=120, blank=True)
    target_role = models.CharField(max_length=120, blank=True)
    study_hours_per_day = models.PositiveSmallIntegerField(default=0)
    disciplines = models.JSONField(default=list, blank=True)

    def __str__(self) -> str:
        return f"Profile({self.user_id})"
