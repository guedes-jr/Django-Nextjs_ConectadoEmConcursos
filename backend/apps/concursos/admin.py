from django.contrib import admin

from .models import Concurso, NewsArticle


@admin.register(Concurso)
class ConcursoAdmin(admin.ModelAdmin):
    list_display = ("title", "organization", "state", "status", "deadline", "source", "fetched_at")
    list_filter = ("status", "state", "source", "region")
    search_fields = ("title", "organization", "roles", "headline")
    readonly_fields = ("fetched_at", "created_at")


@admin.register(NewsArticle)
class NewsArticleAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "source", "published_at", "is_published")
    list_filter = ("category", "source", "is_published")
    search_fields = ("title", "summary")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("fetched_at", "created_at")