from django.conf import settings
from django.db import models


class StudyPlan(models.Model):
    class Kind(models.TextChoices):
        TRACK = "trilha", "Trilha semanal"
        SCHEDULE = "cronograma", "Cronograma de estudos"
        CYCLE = "ciclo", "Ciclo de estudos"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_plans")
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.TRACK)
    title = models.CharField(max_length=80, blank=True)
    goal = models.CharField(max_length=160)
    exam_date = models.DateField(null=True, blank=True)
    disciplines = models.JSONField(default=list)
    weekdays = models.JSONField(default=list)
    minutes_per_day = models.PositiveSmallIntegerField(default=60)
    schedule = models.JSONField(default=list)
    cycle = models.JSONField(default=list)
    reminder_enabled = models.BooleanField(default=False)
    reminder_time = models.TimeField(null=True, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


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
    cycle_index = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["date", "position", "id"]


class StudySession(models.Model):
    block = models.ForeignKey(StudyBlock, on_delete=models.CASCADE, related_name="sessions")
    minutes = models.PositiveSmallIntegerField()
    completed_at = models.DateTimeField(auto_now_add=True)


class StudyInterval(models.Model):
    class Kind(models.TextChoices):
        FOCUS = "focus", "Foco"
        BREAK = "break", "Descanso"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_intervals")
    plan = models.ForeignKey(StudyPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="intervals")
    started_at = models.DateTimeField(auto_now_add=True)
    minutes = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=8, choices=Kind.choices)

    class Meta:
        ordering = ["-started_at"]