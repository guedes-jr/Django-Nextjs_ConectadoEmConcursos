"""Pipeline de importação de questões.

`run()` é a porta de entrada: escolhe a fonte, valida os filtros que ela
declara, executa e devolve o `SearchRun` com o resultado. O `import_content` e o
`sync_questions` são só wrappers deste módulo.
"""

import hashlib
import json
import logging
import time
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.questions.models import QuestionSource, SearchRun

from .duplicates import DuplicateChecker
from apps.questions.naming import normalize_banca
from .pipeline import PipelineCounts, run_items
from .sources import AdapterNotConfigured, get_adapter

logger = logging.getLogger(__name__)

__all__ = [
    "run",
    "fingerprint",
    "legacy_source",
    "AdapterNotConfigured",
]


def legacy_source() -> QuestionSource:
    """Fonte da importação manual — mesmo `slug` criado pela migração de backfill."""
    from apps.questions.models import LEGACY_SOURCE_SLUG

    source, _ = QuestionSource.objects.get_or_create(
        slug=LEGACY_SOURCE_SLUG,
        defaults={
            "name": "Importação manual",
            "kind": QuestionSource.Kind.LOCAL_FILE,
            "license_name": "Não verificada (conteúdo pré-existente)",
        },
    )
    return source


def normalize_filters(filters: dict) -> dict:
    """Filtros na forma canônica: mesma busca gera sempre o mesmo `fingerprint`."""
    normalized = {}
    for key, value in (filters or {}).items():
        if value in (None, "", []):
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
            if key in {"banca", "discipline"}:
                value = normalize_banca(value) if key == "banca" else value
                value = value.lower()
        normalized[str(key)] = value
    return dict(sorted(normalized.items()))


def fingerprint(source_slug: str, filters: dict) -> str:
    """sha256 da fonte + filtros normalizados, para reencontrar a mesma execução."""
    payload = json.dumps(
        {"source": source_slug, "filters": normalize_filters(filters)},
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def run(
    source,
    filters: dict | None = None,
    limit: int | None = None,
    page: int = 1,
    started_by=None,
    dry_run: bool = False,
    parent: SearchRun | None = None,
    force_duplicates: bool = False,
) -> SearchRun:
    """Executa uma busca e grava o resultado como `SearchRun`.

    Erro de configuração (fonte sem licença, filtro que a fonte não suporta) aborta
    **antes** de criar o `SearchRun`; erro no meio vira `partial`, com o que já
    foi importado preservado.
    """
    filters = dict(filters or {})
    adapter = get_adapter(source)
    if not source.license_name:
        raise ValidationError({"source": ["Fonte sem licença informada."]})
    filters = adapter.validate_filters(filters)
    limit = int(limit or settings.QUESTIONS_IMPORT_LIMIT)
    page = max(int(page or 1), 1)

    result = adapter.fetch_questions(filters, limit, page)
    if result.facets:
        source.cached_facets = result.facets
        source.facets_at = timezone.now()
        source.save(update_fields=["cached_facets", "facets_at", "updated_at"])
    run_record = SearchRun.objects.create(
        source=source,
        name=f"{adapter.label} · {page}",
        filters=normalize_filters(filters),
        fingerprint=fingerprint(source.slug, filters),
        status=SearchRun.Status.RUNNING,
        next_page=result.next_page,
        started_by=started_by,
        parent=parent,
    )
    started = time.monotonic()
    counts = PipelineCounts()
    checker = DuplicateChecker()
    try:
        run_items(source, result.items, checker=checker, dry_run=dry_run, counts=counts, search_run=run_record, force_duplicates=force_duplicates)
    finally:
        _finish(run_record, counts, result, started, dry_run=dry_run)
    return run_record


def _finish(run_record: SearchRun, counts: PipelineCounts, result, started: float, dry_run: bool) -> None:
    """Fecha o `SearchRun`: parcial quando algum item falhou, concluída quando não."""
    if counts.errors and counts.seen == counts.errors:
        status = SearchRun.Status.FAILED
    elif counts.errors:
        status = SearchRun.Status.PARTIAL
    else:
        status = SearchRun.Status.DONE
    run_record.status = status
    run_record.counts = counts.as_dict()
    run_record.duplicates_preview = counts.duplicates_preview[:50]
    run_record.finished_at = timezone.now()
    run_record.duration_ms = int((time.monotonic() - started) * 1000)
    run_record.save(
        update_fields=[
            "status",
            "counts",
            "duplicates_preview",
            "finished_at",
            "duration_ms",
            "next_page",
        ]
    )
    if run_record.status == SearchRun.Status.FAILED:
        logger.error("Importação %s falhou em todos os itens.", run_record.pk)


def run_file(
    path: Path,
    source=None,
    dry_run: bool = False,
    started_by=None,
    filters: dict | None = None,
) -> SearchRun:
    """Atalho do `import_content`: lê um arquivo e joga no pipeline."""
    from .parsers import parse_file

    source = source or legacy_source()
    filters = dict(filters or {})
    filters.setdefault("file", str(path))
    adapter = get_adapter(source)
    if adapter.kind != "local_file":
        raise ValidationError({"file": ["Use um arquivo com uma fonte de tipo local_file."]})
    try:
        result = adapter.fetch_questions(filters, settings.QUESTIONS_IMPORT_LIMIT, 1)
    except ValueError as exc:
        raise ValidationError({"file": [str(exc)]}) from exc

    run_record = SearchRun.objects.create(
        source=source,
        name=Path(path).name,
        filters={"file": Path(path).name},
        fingerprint=fingerprint(source.slug, {"file": Path(path).name}),
        status=SearchRun.Status.RUNNING,
        started_by=started_by,
    )
    started = time.monotonic()
    counts = PipelineCounts()
    try:
        run_items(source, result.items, dry_run=dry_run, counts=counts, search_run=run_record)
    finally:
        _finish(run_record, counts, result, started, dry_run=dry_run)
    return run_record
