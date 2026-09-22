from django.conf import settings
from django.db import models


class Exam(models.Model):
    title = models.CharField(max_length=200)
    banca = models.CharField(max_length=100, db_index=True)
    institution = models.CharField(max_length=160, blank=True, db_index=True)
    role = models.CharField(max_length=160, blank=True, db_index=True)
    year = models.PositiveSmallIntegerField(db_index=True)
    is_published = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "banca", "title"]

    def __str__(self):
        return f"{self.banca} - {self.title} ({self.year})"


class Question(models.Model):
    exam = models.ForeignKey(
        Exam,
        on_delete=models.SET_NULL,
        related_name="questions",
        null=True,
        blank=True,
    )
    discipline = models.CharField(max_length=100, db_index=True)
    banca = models.CharField(max_length=100, db_index=True)
    year = models.PositiveSmallIntegerField(db_index=True)
    statement = models.TextField()
    options = models.JSONField(default=list)
    correct_answer = models.PositiveSmallIntegerField()
    explanation = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "id"]

    def __str__(self):
        return f"{self.banca} {self.year} - {self.discipline} ({self.pk})"


class UserAnswer(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="answers"
    )
    selected_answer = models.PositiveSmallIntegerField()
    is_correct = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["user", "question", "-created_at"],
                name="questions_answer_user_idx",
            )
        ]


class Favorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="favorites"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "question"], name="unique_question_favorite"
            )
        ]


class QuestionNote(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="notes"
    )
    content = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "question"], name="unique_question_note"
            )
        ]


class Comment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="comments"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]


class ErrorReport(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Aberto"
        RESOLVED = "resolved", "Resolvido"
        REJECTED = "rejected", "Rejeitado"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="error_reports"
    )
    description = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
