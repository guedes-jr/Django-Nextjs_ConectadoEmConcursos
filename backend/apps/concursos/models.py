from django.conf import settings
from django.db import models


class Concurso(models.Model):
    class Origin(models.TextChoices):
        MANUAL = "manual", "Manual"
        IMPORTED = "imported", "Importado"

    class EditorialStatus(models.TextChoices):
        PUBLISHED = "published", "Publicado"
        ARCHIVED = "archived", "Arquivado"

    class Status(models.TextChoices):
        OPEN = "open", "Inscrições abertas"
        EXPECTED = "expected", "Autorizado / Previsto"
        CLOSED = "closed", "Encerrado"

    source = models.CharField(max_length=32, db_index=True)
    origin = models.CharField(max_length=12, choices=Origin.choices, default=Origin.IMPORTED, db_index=True)
    editorial_status = models.CharField(max_length=12, choices=EditorialStatus.choices, default=EditorialStatus.PUBLISHED, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_concursos")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_concursos")
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
    class EditorialStatus(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        SCHEDULED = "scheduled", "Agendado"
        PUBLISHED = "published", "Publicado"
        ARCHIVED = "archived", "Arquivado"

    source = models.CharField(max_length=32, db_index=True)
    external_id = models.CharField(max_length=255, db_index=True)
    origin = models.CharField(max_length=12, choices=Concurso.Origin.choices, default=Concurso.Origin.IMPORTED, db_index=True)
    editorial_status = models.CharField(max_length=12, choices=EditorialStatus.choices, default=EditorialStatus.PUBLISHED, db_index=True)
    scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="authored_news")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_news")
    slug = models.SlugField(max_length=260, unique=True, db_index=True)
    title = models.CharField(max_length=300)
    summary = models.TextField(blank=True)
    body = models.TextField(blank=True)
    category = models.CharField(max_length=64, blank=True, db_index=True)
    image_url = models.URLField(max_length=500, blank=True)
    seo_title = models.CharField(max_length=300, blank=True)
    seo_description = models.CharField(max_length=160, blank=True)
    tags = models.JSONField(default=list, blank=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    is_pinned = models.BooleanField(default=False, db_index=True)
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

class ArticleView(models.Model):
    article = models.ForeignKey(NewsArticle, on_delete=models.CASCADE, related_name="views")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    session_key = models.CharField(max_length=80, blank=True, db_index=True)
    referrer = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["article", "created_at"])]


class EditorialCategory(models.Model):
    name = models.CharField(max_length=64, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
