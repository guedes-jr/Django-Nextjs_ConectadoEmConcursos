"""Grava `QuestionItem` no banco, um item por transação.

Três regras definem o comportamento:

- **Nada novo é publicado.** Tudo que entra nasce `PENDING` e fora do ar; só a
  fila de aprovação (Fase 2) coloca no ar.
- **Explicação curada não se perde.** Se a fonte não manda comentário, o texto já
  gravado continua.
- **Questão viva não muda em silêncio.** Se o `content_hash` de uma questão
  aprovada muda, ela volta para a fila em vez de trocar o enunciado no ar.
"""

import logging
from dataclasses import dataclass, field

from django.db import transaction
from django.utils import timezone

from apps.questions.models import Exam, Question, QuestionStemToken, QuestionSource
from apps.questions.naming import normalize_banca, normalize_discipline

from .base import QuestionItem
from .duplicates import DuplicateChecker, content_hash, signature_tokens, tokenize

logger = logging.getLogger(__name__)

DEFAULT_EXAM_FIELDS = {"institution": "", "role": "", "is_published": True}


class PipelineError(Exception):
    """Item inválido: o erro é do conteúdo da fonte, não do sistema."""


@dataclass
class PipelineCounts:
    """Contadores de uma execução, gravados em `SearchRun.counts`."""

    seen: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    duplicates_skipped: int = 0
    invalidations: int = 0
    pending: int = 0
    errors: int = 0
    duplicates_preview: list = field(default_factory=list)
    messages: list = field(default_factory=list)

    def bump(self, name: str, amount: int = 1):
        setattr(self, name, getattr(self, name) + amount)

    def as_dict(self) -> dict:
        return {
            "seen": self.seen,
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "duplicates_skipped": self.duplicates_skipped,
            "invalidations": self.invalidations,
            "pending": self.pending,
            "errors": self.errors,
        }


def resolve_exam(item: QuestionItem) -> Exam | None:
    """Cria ou atualiza a prova. A unicidade é (title, banca, year) desde a Fase 0."""
    title = (item.exam_title or "").strip()
    if not title:
        return None
    exam, _ = Exam.objects.update_or_create(
        title=title,
        banca=normalize_banca(item.banca.strip()),
        year=item.year,
        defaults={
            "institution": item.institution.strip() or DEFAULT_EXAM_FIELDS["institution"],
            "role": item.role.strip() or DEFAULT_EXAM_FIELDS["role"],
            "level": item.level.strip(),
            "state": item.state.strip().upper()[:2],
            "is_published": item.is_published_exam,
        },
    )
    return exam


def find_existing(source: QuestionSource, item: QuestionItem) -> Question | None:
    """Ordem de checagem: id externo da fonte primeiro, enunciado equivalente depois."""
    if item.external_id:
        found = Question.objects.filter(source=source, external_id=item.external_id).first()
        if found:
            return found
    return Question.objects.filter(
        statement=item.statement, banca=normalize_banca(item.banca.strip()), year=item.year
    ).first()


def refresh_stem_index(question: Question, checker: DuplicateChecker | None = None) -> None:
    """Reescreve os 8 tokens mais raros do enunciado e ajusta a frequência global."""
    tokens = tokenize(question.statement)
    frequencies = checker.frequencies if checker else _frequencies_from_db()
    QuestionStemToken.objects.filter(question=question).delete()
    QuestionStemToken.objects.bulk_create(
        [
            QuestionStemToken(question=question, token=token, df=frequencies.get(token, 0))
            for token in signature_tokens(tokens, frequencies)
        ],
        batch_size=100,
    )


def _frequencies_from_db() -> dict[str, int]:
    return {
        token: df
        for token, df in QuestionStemToken.objects.values_list("token", "df")
        if df
    }


def ingest_item(
    source: QuestionSource,
    item: QuestionItem,
    checker: DuplicateChecker,
    counts: PipelineCounts,
    dry_run: bool = False,
    search_run=None,
    force_duplicates: bool = False,
) -> Question | None:
    """Processa um item. Devolve a questão gravada ou `None` se foi pulado."""
    counts.bump("seen")
    validate(item)
    digest = content_hash(item.statement, item.options)
    existing = find_existing(source, item)

    if existing:
        return _update_existing(existing, item, digest, counts, checker, dry_run, search_run)

    match = checker.check(item.statement, item.options, item.correct_answer)
    if checker.is_duplicate(match) and not force_duplicates:
        counts.bump("duplicates_skipped")
        _record_skip(counts, item, match, checker)
        return None

    if dry_run:
        counts.bump("created")
        counts.bump("pending")
        return None

    return _create(source, item, digest, match, counts, checker, search_run)


def validate(item: QuestionItem) -> None:
    if not item.statement.strip():
        raise PipelineError("enunciado vazio")
    if len(item.options) < 2:
        raise PipelineError("menos de duas alternativas")
    if not item.has_answer:
        raise PipelineError("gabarito fora do intervalo das alternativas")
    if not item.year or not (1980 <= item.year <= 2100):
        raise PipelineError(f"ano inválido: {item.year}")


def _record_skip(counts: PipelineCounts, item: QuestionItem, match, checker: DuplicateChecker) -> None:
    if len(counts.duplicates_preview) < 50:
        counts.duplicates_preview.append(
            {
                "external_id": item.external_id,
                "match_id": match.question_id,
                "score": match.percent,
                "exact": match.exact_hash,
                "statement": item.statement[:120],
            }
        )
    counts.messages.append(
        f"pulada: {checker.describe(match, item.correct_answer)} — {item.statement[:60]}"
    )


def _create(
    source: QuestionSource,
    item: QuestionItem,
    digest: str,
    match,
    counts: PipelineCounts,
    checker: DuplicateChecker,
    search_run=None,
) -> Question:
    exam = resolve_exam(item)
    question = Question.objects.create(
        source=source,
        search_run=search_run,
        external_id=item.external_id or None,
        exam=exam,
        statement=item.statement,
        banca=normalize_banca(item.banca.strip()),
        year=item.year,
        discipline=normalize_discipline(item.discipline.strip()),
        options=item.options,
        correct_answer=item.correct_answer,
        explanation=item.explanation.strip(),
        content_hash=digest,
        source_url=item.source_url,
        number=item.number,
        status=Question.Status.PENDING,
        is_active=False,
        review_note=checker.describe(match, item.correct_answer),
    )
    refresh_stem_index(question, checker)
    checker.index(question)
    counts.bump("created")
    counts.bump("pending")
    if match:
        counts.messages.append(f"nova #{question.pk}: {question.review_note}")
    return question


def _update_existing(
    question: Question,
    item: QuestionItem,
    digest: str,
    counts: PipelineCounts,
    checker: DuplicateChecker,
    dry_run: bool,
    search_run=None,
) -> Question:
    if question.content_hash == digest:
        # Reimportar o mesmo conteúdo não pode apagar comentário nem mudar status.
        if not dry_run:
            _refresh_metadata(question, item)
        counts.bump("unchanged")
        return question

    invalidation = question.status == Question.Status.APPROVED
    if invalidation:
        counts.bump("invalidations")
        counts.messages.append(
            f"#{question.pk} volta para a fila: o conteúdo mudou na fonte."
        )
    counts.bump("updated")
    if dry_run:
        return question

    _refresh_metadata(question, item)
    if search_run is not None:
        question.search_run = search_run
    question.content_hash = digest
    question.statement = item.statement
    question.options = item.options
    question.correct_answer = item.correct_answer
    if item.explanation.strip():
        question.explanation = item.explanation.strip()
    if invalidation:
        question.status = Question.Status.PENDING
        question.is_active = False
        question.reviewed_by = None
        question.reviewed_at = None
        question.review_note = f"Conteúdo alterado na fonte em {timezone.now():%d/%m/%Y}."
    question.save()
    refresh_stem_index(question, checker)
    checker.index(question)
    return question


def _refresh_metadata(question: Question, item: QuestionItem) -> None:
    """Metadados que a fonte é dona: enunciado e gabarito ficam de fora."""
    exam = resolve_exam(item)
    question.exam = exam
    question.banca = normalize_banca(item.banca.strip())
    question.year = item.year
    question.discipline = normalize_discipline(item.discipline.strip())
    if item.number is not None:
        question.number = item.number
    if item.source_url:
        question.source_url = item.source_url
    question.save(
        update_fields=["exam", "banca", "year", "discipline", "number", "source_url", "updated_at"]
    )


def run_items(
    source: QuestionSource,
    items,
    checker: DuplicateChecker | None = None,
    dry_run: bool = False,
    counts: PipelineCounts | None = None,
    search_run=None,
    force_duplicates: bool = False,
) -> PipelineCounts:
    """Processa a lista inteira. Um item ruim não desfaz os anteriores."""
    counts = counts or PipelineCounts()
    checker = checker or DuplicateChecker()
    for item in items:
        try:
            with transaction.atomic():
                ingest_item(source, item, checker, counts, dry_run=dry_run, search_run=search_run, force_duplicates=force_duplicates)
        except (PipelineError, ValueError, KeyError, TypeError) as exc:
            counts.bump("errors")
            counts.messages.append(f"erro: {exc}")
            logger.warning("Item ignorado na importação: %s", exc)
    return counts
