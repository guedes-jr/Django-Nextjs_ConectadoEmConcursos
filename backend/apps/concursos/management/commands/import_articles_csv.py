import json
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify
from apps.backoffice.audit import audited_command, log
from apps.backoffice.backup_storage import operation_lock
from apps.concursos.article_csv import prepare, SOURCE
from apps.concursos.models import NewsArticle, EditorialCategory


class Command(BaseCommand):
    help = 'Importa exportação CSV como artigos editoriais. Simulação por padrão; use --apply para gravar.'
    def add_arguments(self, parser):
        parser.add_argument('file')
        parser.add_argument('--apply', action='store_true')

    @audited_command('import_articles_csv')
    def handle(self, *args, **options):
        try:
            items, digest = prepare(options['file'])
            report = {'records': len(items), 'published': sum(x.is_published for x in items),
                      'featured': sum(x.is_featured for x in items), 'created': 0, 'unchanged': 0, 'file_sha256': digest}
            with operation_lock(settings.BACKUP_DIR), transaction.atomic():
                for item in items:
                    existing = NewsArticle.objects.filter(source=SOURCE, external_id=item.external_id).first()
                    if existing:
                        fields = ['title', 'summary', 'body', 'category', 'tags', 'image_url', 'is_featured', 'editorial_status', 'is_published', 'published_at']
                        old_meta={k:v for k,v in existing.source_metadata.items() if k!='file_sha256'}
                        new_meta={k:v for k,v in item.source_metadata.items() if k!='file_sha256'}
                        if old_meta != new_meta or any(getattr(existing, f) != getattr(item, f) for f in fields):
                            raise ValueError(f'Artigo {item.external_id} já existe com alterações; nenhuma sobrescrita foi feita.')
                        report['unchanged'] += 1
                        continue
                    if NewsArticle.objects.filter(slug=item.slug).exists():
                        raise ValueError(f'Slug já utilizado: {item.slug}')
                    report['created'] += 1
                    if options['apply']:
                        item.save(force_insert=True)
                        log(action='article.csv_imported', resource_type='article', resource_id=item.pk,
                            after={'source': SOURCE, 'external_id': item.external_id, 'title': item.title,
                                   'editorial_status': item.editorial_status, 'content_sha256': item.source_metadata['content_sha256']},
                            context={'file_sha256': digest})
                if options['apply']:
                    for name in sorted({x.category for x in items}):
                        if not EditorialCategory.objects.filter(name=name).exists():
                            slug = slugify(name); candidate = slug; index = 2
                            while EditorialCategory.objects.filter(slug=candidate).exists():
                                candidate = f'{slug}-{index}'; index += 1
                            category = EditorialCategory.objects.create(name=name, slug=candidate)
                            log(action='article.category_created', resource_type='editorial_category', resource_id=category.pk, after={'name': name})
            self.stdout.write(json.dumps({**report, 'apply': options['apply']}, ensure_ascii=False))
        except Exception as exc:
            raise CommandError(str(exc)) from exc
