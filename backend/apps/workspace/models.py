from django.conf import settings
from django.db import models


class Notebook(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_notebooks")
    title = models.CharField(max_length=120)
    questions = models.ManyToManyField("questions.Question", blank=True, related_name="study_notebooks")
    created_at = models.DateTimeField(auto_now_add=True)


class Flashcard(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="flashcards")
    discipline = models.CharField(max_length=100, blank=True)
    front = models.CharField(max_length=500)
    back = models.TextField()
    next_review_at = models.DateTimeField(null=True, blank=True)
    interval_days = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)


class CommunityPost(models.Model):
    class Kind(models.TextChoices):
        FORUM = "forum", "Fórum"
        FEED = "feed", "Feed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="community_posts")
    kind = models.CharField(max_length=8, choices=Kind.choices)
    title = models.CharField(max_length=160, blank=True)
    content = models.TextField()
    parent = models.ForeignKey("self", on_delete=models.CASCADE, related_name="replies", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class SimulationRun(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="simulation_runs")
    answers = models.JSONField(default=list)
    score = models.PositiveSmallIntegerField(default=0)
    total = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)


class ExamSubmission(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        REVIEWED = "reviewed", "Revisada"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=160)
    source_url = models.URLField(blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
