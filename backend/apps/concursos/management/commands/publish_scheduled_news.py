"""Publica artigos agendados com auditoria transacional por artigo."""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.backoffice.audit import audited_command, log as audit_log
from apps.concursos.models import NewsArticle


class Command(BaseCommand):
    help = "Publica artigos agendados com data igual ou anterior a agora."

    @audited_command("publish_scheduled_news")
    def handle(self, *args, **options):
        now = timezone.now()
        updated = 0
        with transaction.atomic():
            articles = NewsArticle.objects.select_for_update().filter(
                editorial_status=NewsArticle.EditorialStatus.SCHEDULED, scheduled_for__lte=now,
            )
            for article in articles:
                before = {"editorial_status": article.editorial_status, "is_published": article.is_published}
                article.editorial_status = NewsArticle.EditorialStatus.PUBLISHED
                article.is_published = True
                article.published_at = now
                article.save(update_fields=["editorial_status", "is_published", "published_at"])
                audit_log(action="article.published", resource_type="article", resource_id=article.pk, before=before,
                          after={"editorial_status": article.editorial_status, "is_published": True, "published_at": now})
                updated += 1
        self.stdout.write(self.style.SUCCESS(f"{updated} artigo(s) publicado(s)."))
