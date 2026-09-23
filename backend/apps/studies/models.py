from django.conf import settings
from django.db import models


class StudyPlan(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_plan")
    goal = models.CharField(max_length=160)
    exam_date = models.DateField(null=True, blank=True)
    disciplines = models.JSONField(default=list)
    weekdays = models.JSONField(default=list)
    minutes_per_day = models.PositiveSmallIntegerField(default=60)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class StudyBlock(models.Model):
    class Kind(models.TextChoices):
        THEORY = "theory", "Teoria"
        QUESTIONS = "questions", "Questões"
        REVIEW = "review", "Revisão"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        DONE = "done", "Concluído"
        SKIPPED = "skipped", "Adiado"

    plan = models.ForeignKey(StudyPlan, on_delete=models.CASCADE, related_name="blocks")
    date = models.DateField(db_index=True)
    discipline = models.CharField(max_length=100)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    planned_minutes = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["date", "position", "id"]


class StudySession(models.Model):
    block = models.ForeignKey(StudyBlock, on_delete=models.CASCADE, related_name="sessions")
    minutes = models.PositiveSmallIntegerField()
    completed_at = models.DateTimeField(auto_now_add=True)
