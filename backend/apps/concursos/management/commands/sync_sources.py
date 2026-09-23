"""Sincroniza concursos e notícias a partir das fontes externas configuradas.

Uso:
    python manage.py sync_sources
    python manage.py sync_sources --source pci --no-news
    python manage.py sync_sources --dry-run --no-concursos

O comando é idempotente: itens duplicados são atualizados em vez de
recriados (chave única source + external_id).
"""

import hashlib

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils.text import slugify

from apps.concursos.models import Concurso, NewsArticle
from apps.concursos.sources import build_adapters

TRUNC = {
    "title": 300,
    "organization": 255,
    "headline": 160,
    "state": 2,
    "region": 40,
    "category": 64,
}


def _cut(value: str, key: str) -> str:
    text = (value or "").strip()
    return text[: TRUNC[key]]


def _free_slug(base_slug: str, exclude_pk: int | None = None) -> str:
    candidate = base_slug[:240]
    if not NewsArticle.objects.filter(slug=candidate).exclude(pk=exclude_pk).exists():
        return candidate
    digest = hashlib.sha1(candidate.encode("utf-8")).hexdigest()[:8]
    return f"{candidate[:230]}-{digest}"


class Command(BaseCommand):
    help = "Busca concursos e notícias nas fontes configuradas e atualiza o banco."

    def add_arguments(self, parser):
        parser.add_argument("--source", action="append", dest="sources", default=None,
                            help="Nome da fonte a executar (pci, google-news, rss, community). Repetível.")
        parser.add_argument("--no-concursos", action="store_true", help="Não sincronizar concursos.")
        parser.add_argument("--no-news", action="store_true", help="Não sincronizar notícias.")
        parser.add_argument("--dry-run", action="store_true", help="Não gravar, apenas reportar.")

    def handle(self, *args, **options):
        enabled = options.get("sources")
        skip_concursos = options["no_concursos"]
        skip_news = options["no_news"]
        dry_run = options["dry_run"]

        adapters = build_adapters(enabled)
        if not adapters:
            self.stderr.write("Nenhuma fonte ativa para sincronizar.")
            return

        summary = {"created": 0, "updated": 0, "failed": 0, "concursos": 0, "news": 0}
        for adapter in adapters:
            if not skip_concursos:
                items = adapter.fetch_concursos()
                created, updated, failed = self.sync_concursos(adapter, items, dry_run)
                summary["created"] += created
                summary["updated"] += updated
                summary["failed"] += failed
                summary["concursos"] += len(items)
                self.stdout.write(
                    f"{adapter.label}: {len(items)} concursos -> {created} novos, {updated} atualizados"
                    + (", falhas: %d" % failed if failed else "")
                )
            if not skip_news:
                items = adapter.fetch_news()
                created, updated, failed = self.sync_news(adapter, items, dry_run)
                summary["created"] += created
                summary["updated"] += updated
                summary["failed"] += failed
                summary["news"] += len(items)
                self.stdout.write(
                    f"{adapter.label}: {len(items)} notícias -> {created} novos, {updated} atualizados"
                    + (", falhas: %d" % failed if failed else "")
                )

        verb = "Simularia" if dry_run else "Total"
        self.stdout.write(
            f"{verb}: {summary['concursos']} concursos, {summary['news']} notícias, "
            f"{summary['created']} novos, {summary['updated']} atualizados, "
            f"{summary['failed']} falhas."
        )

    def sync_concursos(self, adapter, items, dry_run: bool):
        created = updated = failed = 0
        for item in items:
            if not item.external_id or not item.title:
                continue
            defaults = {
                "title": _cut(item.title, "title"),
                "organization": _cut(item.organization, "organization"),
                "body": (item.body or "")[:4000],
                "headline": _cut(item.headline, "headline"),
                "roles": item.roles[:12],
                "levels": item.levels[:8],
                "state": _cut(item.state or "", "state").upper(),
                "region": _cut(item.region, "region"),
                "status": item.status if item.status in Concurso.Status.values else "expected",
                "deadline": item.deadline,
                "source_url": (item.source_url or "")[:600],
                "vacancies": item.vacancies,
                "max_salary": item.max_salary,
                "published_at": item.published_at,
            }
            if dry_run:
                created += 1
                continue
            try:
                with transaction.atomic():
                    _, was_created = Concurso.objects.update_or_create(
                        source=item.source or adapter.name,
                        external_id=item.external_id,
                        defaults=defaults,
                    )
                created += 1 if was_created else 0
                updated += 0 if was_created else 1
            except Exception:
                failed += 1
        return created, updated, failed

    def sync_news(self, adapter, items, dry_run: bool):
        created = updated = failed = 0
        for item in items:
            if not item.external_id or not item.title:
                continue
            base_slug = slugify(item.title) or slugify(item.external_id)[:50]
            if not base_slug:
                continue
            existing = NewsArticle.objects.filter(source=item.source or adapter.name, external_id=item.external_id).first()
            if existing and existing.slug:
                default_slug = existing.slug
            else:
                default_slug = _free_slug(base_slug, exclude_pk=existing.pk if existing else None)
            defaults = {
                "slug": default_slug,
                "title": _cut(item.title, "title"),
                "summary": (item.summary or "")[:600],
                "body": (item.body or "")[:10000],
                "category": _cut(item.category, "category"),
                "image_url": (item.image_url or "")[:500],
                "source_url": (item.source_url or "")[:600],
                "published_at": item.published_at,
                "is_published": True,
            }
            if dry_run:
                created += 1
                continue
            try:
                with transaction.atomic():
                    _, was_created = NewsArticle.objects.update_or_create(
                        source=item.source or adapter.name,
                        external_id=item.external_id,
                        defaults=defaults,
                    )
                created += 1 if was_created else 0
                updated += 0 if was_created else 1
            except Exception:
                failed += 1
        return created, updated, failed