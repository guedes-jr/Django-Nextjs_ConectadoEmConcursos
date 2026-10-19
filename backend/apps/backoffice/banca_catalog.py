"""Cadastro revisado e vínculos exatos, sem reescrever o histórico das questões."""
import json
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.backoffice.audit import log as audit_log
from apps.concursos.models import Concurso
from apps.questions.models import BancaAlias, BancaCatalog, Exam, Question
from apps.questions.naming import banca_key, resolve_banca_catalog

DEFAULT_CATALOG = Path(__file__).with_name('data') / 'bancas-brasil.json'


def relink_exams(banca=None):
    """Somente correspondência exata normalizada. Não muda banca textual nem concurso."""
    changed = []
    for exam in Exam.objects.only('id', 'banca', 'banca_catalog_id').iterator():
        match = resolve_banca_catalog(exam.banca)
        if banca and (not match or match.pk != banca.pk):
            continue
        target = match.pk if match else None
        if exam.banca_catalog_id != target:
            before = exam.banca_catalog_id
            Exam.objects.filter(pk=exam.pk).update(banca_catalog_id=target)
            audit_log(action='exam.banca_linked', resource_type='exam', resource_id=exam.pk,
                      before={'banca_catalog': before}, after={'banca_catalog': target},
                      context={'method': 'exact_normalized_name', 'legacy_text_preserved': True})
            changed.append(exam.pk)
    return changed


def populate_catalog(path=DEFAULT_CATALOG, *, apply=False):
    document = json.loads(Path(path).read_text())
    entries = document['bancas']
    result = {'created': 0, 'enriched': 0, 'aliases_created': 0, 'exams_linked': 0,
              'observed_added': 0, 'concursos_linked': 0, 'conflicts': [], 'apply': apply}
    with transaction.atomic():
        for entry in entries:
            name = entry['name']
            parsed = urlsplit(entry['official_url'])
            if parsed.scheme != 'https' or not parsed.hostname:
                raise ValidationError(f'URL institucional inválida: {name}')
            banca = resolve_banca_catalog(name)
            if banca and banca.normalized_name != banca_key(name):
                raise ValidationError(f'Nome canônico já pertence a outro cadastro: {name}')
            sources = entry.get('sources') or [entry['official_url']]
            description = entry['description'] + '\n\nFontes oficiais: ' + ', '.join(sources) + '\nRevisão institucional: ' + entry['verified_at'] + '.'
            if not banca:
                banca = BancaCatalog.objects.create(name=name, official_url=entry['official_url'], description=description)
                result['created'] += 1
                audit_log(action='banca.seed_created', resource_type='banca', resource_id=banca.pk,
                          after={'name': name, 'official_url': banca.official_url}, context={'sources': sources})
            else:
                fields = []
                for key, value in [('official_url', entry['official_url']), ('description', description)]:
                    if not getattr(banca, key):
                        setattr(banca, key, value)
                        fields.append(key)
                if fields:
                    banca.save(update_fields=[*fields, 'updated_at'])
                    result['enriched'] += 1
                    audit_log(action='banca.seed_enriched', resource_type='banca', resource_id=banca.pk,
                              after={key: getattr(banca, key) for key in fields})
            for alias in entry.get('aliases', []):
                key = banca_key(alias)
                if key == banca.normalized_name:
                    continue
                existing = resolve_banca_catalog(alias)
                if existing and existing.pk != banca.pk:
                    raise ValidationError(f'Alias ambíguo: {alias}')
                _, created = BancaAlias.objects.get_or_create(normalized_alias=key, defaults={'alias': alias, 'banca': banca})
                result['aliases_created'] += int(created)

        # Também cobre identificadores do acervo que não constem do catálogo revisado.
        observed = set(Exam.objects.values_list('banca', flat=True)) | set(Question.objects.values_list('banca', flat=True))
        for text in sorted(observed):
            if banca_key(text) and not resolve_banca_catalog(text):
                BancaCatalog.objects.create(name=text.strip(), description='Identificador presente no acervo. Dados institucionais ainda precisam de conferência.')
                result['observed_added'] += 1

        result['exams_linked'] = len(relink_exams())
        # Propaga apenas evidência estrutural unânime de provas já vinculadas.
        for concurso in Concurso.objects.filter(banca__isnull=True).prefetch_related('exams'):
            exams = list(concurso.exams.all())
            ids = {exam.banca_catalog_id for exam in exams if exam.banca_catalog_id}
            if len(ids) == 1 and all(exam.banca_catalog_id for exam in exams):
                target = ids.pop()
                Concurso.objects.filter(pk=concurso.pk, banca__isnull=True).update(banca_id=target)
                result['concursos_linked'] += 1
                audit_log(action='concurso.banca_linked', resource_type='concurso', resource_id=concurso.pk,
                          after={'banca': target}, context={'method': 'unanimous_linked_exams'})
            elif len(ids) > 1:
                result['conflicts'].append({'concurso': concurso.pk, 'reason': 'multiple_exam_bancas'})
        # Vínculos revisados por URL exata da notícia + título esperado + fonte oficial.
        for link in document.get('concurso_links', []):
            target = resolve_banca_catalog(link['banca'])
            if not target:
                raise ValidationError('Banca do vínculo revisado não cadastrada.')
            for concurso in Concurso.objects.filter(source_url=link['source_url']):
                if banca_key(link['title_contains']) not in banca_key(concurso.title):
                    result['conflicts'].append({'concurso': concurso.pk, 'reason': 'reviewed_title_mismatch'})
                    continue
                if concurso.banca_id and concurso.banca_id != target.pk:
                    result['conflicts'].append({'concurso': concurso.pk, 'reason': 'existing_editorial_assignment'})
                    continue
                if not concurso.banca_id:
                    Concurso.objects.filter(pk=concurso.pk, banca__isnull=True).update(banca=target)
                    result['concursos_linked'] += 1
                    audit_log(action='concurso.banca_linked', resource_type='concurso', resource_id=concurso.pk,
                              after={'banca': target.pk}, context={'method': 'reviewed_official_source', 'evidence_url': link['evidence_url']})
        result['concursos_without_banca'] = Concurso.objects.filter(banca__isnull=True).count()
        # Divergência no título é somente sinalizada; não equivale a um edital.
        for exam in Exam.objects.only('id', 'title', 'banca'):
            if 'SEPROD' in exam.title.upper() and banca_key(exam.banca) == 'IBPTEC':
                result['conflicts'].append({'exam': exam.pk, 'reason': 'title_seprod_text_ibptec'})
        audit_log(action='banca.catalog_populated', resource_type='banca_catalog', after=result)
        if not apply:
            transaction.set_rollback(True)
    return result
