"""Leitura fiel de exportações de artigos, com IDs externos estáveis."""
import csv
import hashlib
import json
from datetime import timezone as dt_timezone
from html.parser import HTMLParser
from pathlib import Path
from django.core.exceptions import ValidationError
from django.utils.dateparse import parse_datetime
from django.utils.text import slugify
from django.utils import timezone
from .models import NewsArticle

SOURCE = 'articles_csv'
SUBJECTS = {'portugues': 'Português', 'direito_administrativo': 'Direito Administrativo',
            'direito_constitucional': 'Direito Constitucional', 'conhecimentos_gerais': 'Conhecimentos Gerais'}


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)


def boolean(value):
    value = value.strip().lower()
    if value not in {'true', 'false', '1', '0'}:
        raise ValueError('Valor booleano inválido no CSV.')
    return value in {'true', '1'}


def prepare(path):
    path = Path(path)
    csv.field_size_limit(32 * 1024 * 1024)
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        required = {'id', 'title', 'subject', 'category', 'tags', 'content', 'is_published', 'is_featured', 'created_date'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('Colunas obrigatórias ausentes no CSV.')
        records = list(reader)
    if not records:
        raise ValueError('CSV sem artigos.')
    seen = set(); items = []
    file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    for row in records:
        external_id = row['id'].strip()
        if not external_id or external_id in seen:
            raise ValueError('Identificador ausente ou duplicado no CSV.')
        seen.add(external_id)
        body = row['content']
        if not body.strip() or not row['title'].strip():
            raise ValueError('Artigo sem título ou conteúdo.')
        tags = json.loads(row['tags'] or '[]')
        if not isinstance(tags, list) or any(not isinstance(tag, str) or len(tag) > 100 for tag in tags):
            raise ValueError('Etiquetas inválidas.')
        date = parse_datetime(row['created_date'])
        if date is None:
            raise ValueError('Data original inválida.')
        if timezone.is_naive(date):
            date = timezone.make_aware(date, dt_timezone.utc)
        minutes = (row.get('reading_time') or '').strip()
        if minutes and (not minutes.isdigit() or int(minutes) < 0):
            raise ValueError('Tempo de leitura inválido.')
        published = boolean(row['is_published'])
        summary = row.get('summary') or ''
        if not summary:
            parser = PlainText(); parser.feed(body)
            summary = ' '.join(' '.join(parser.parts).split())[:300]
        metadata = {key: value for key, value in row.items() if key not in {'content'}}
        metadata.update(content_sha256=hashlib.sha256(body.encode()).hexdigest(),
                        file_sha256=file_hash, reading_time_minutes=int(minutes) if minutes else None,
                        naive_dates_assumed_utc=True)
        item = NewsArticle(source=SOURCE, external_id=external_id, origin='manual',
                           slug=f'{slugify(row["title"])[:220] or "artigo"}-{external_id}',
                           title=row['title'].strip(), summary=summary, body=body,
                           category=SUBJECTS.get(row['subject'], row['subject'] or row['category']),
                           tags=tags, image_url=row.get('cover_image_url') or '',
                           is_featured=boolean(row['is_featured']),
                           editorial_status='published' if published else 'draft', is_published=published,
                           published_at=date if published else None, source_metadata=metadata)
        # A validação de unicidade e o confronto com registros existentes ocorrem
        # antes da transação, no importador. Não alterar registros já editados.
        item.full_clean(validate_unique=False, validate_constraints=False)
        items.append(item)
    return items, file_hash
