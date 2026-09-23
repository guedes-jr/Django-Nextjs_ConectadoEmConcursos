from django.db import models


class Concurso(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Inscrições abertas"
        EXPECTED = "expected", "Autorizado / Previsto"
        CLOSED = "closed", "Encerrado"

    source = models.CharField(max_length=32, db_index=True)
    external_id = models.CharField(max_length=255, db_index=True)
    title = models.CharField(max_length=300)
    organization = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    headline = models.CharField(max_length=160, blank=True)
    roles = models.JSONField(default=list)
    levels = models.JSONField(default=list)
    state = models.CharField(max_length=2, blank=True, db_index=True)
    region = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN, db_index=True)
    deadline = models.DateField(null=True, blank=True, db_index=True)
    source_url = models.URLField(max_length=600, blank=True)
    vacancies = models.PositiveIntegerField(null=True, blank=True)
    max_salary = models.IntegerField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    fetched_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fetched_at", "-id"]
        indexes = [
            models.Index(fields=["state", "status"], name="concursos_state_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["source", "external_id"], name="unique_concurso_source"),
        ]

    def __str__(self):
        return f"{self.title} ({self.source})"


class NewsArticle(models.Model):
    source = models.CharField(max_length=32, db_index=True)
    external_id = models.CharField(max_length=255, db_index=True)
    slug = models.SlugField(max_length=260, unique=True, db_index=True)
    title = models.CharField(max_length=300)
    summary = models.TextField(blank=True)
    body = models.TextField(blank=True)
    category = models.CharField(max_length=64, blank=True, db_index=True)
    image_url = models.URLField(max_length=500, blank=True)
    source_url = models.URLField(max_length=600, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    is_published = models.BooleanField(default=True, db_index=True)
    fetched_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-published_at", "-fetched_at"]
        constraints = [
            models.UniqueConstraint(fields=["source", "external_id"], name="unique_news_source"),
        ]

    def __str__(self):
        return self.title