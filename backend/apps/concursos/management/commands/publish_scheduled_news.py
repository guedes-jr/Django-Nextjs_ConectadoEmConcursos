"""Publica artigos agendados cuja data já chegou; adequado para cron ou django-q."""
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.concursos.models import NewsArticle

class Command(BaseCommand):
    help = "Publica artigos agendados com data igual ou anterior a agora."
    def handle(self, *args, **options):
        now = timezone.now()
        updated = NewsArticle.objects.filter(
            editorial_status=NewsArticle.EditorialStatus.SCHEDULED,
            scheduled_for__lte=now,
        ).update(editorial_status=NewsArticle.EditorialStatus.PUBLISHED, is_published=True, published_at=now)
        self.stdout.write(self.style.SUCCESS(f"{updated} artigo(s) publicado(s)."))
