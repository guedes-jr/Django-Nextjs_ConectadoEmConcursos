"""Conversão de prova enviada pelo aluno em questões.

O envio do aluno é material de terceiro: entra na fila como `PENDING`, como todo
conteúdo novo, e só vira questão pelo mesmo pipeline das fontes oficiais. Nada
aparece para o aluno sem passar pela curadoria.

Duas decisões que não são óbvias:

- **Uma fonte por envio.** `QuestionSource` é a unidade de proveniência, e a
  atribuição mostrada ao aluno sai dela. Uma fonte compartilhada ("envio de aluno")
  não consegue dizer *de quem* é cada questão, então cada envio ganha a sua, com o
  crédito do autor. Elas nascem `is_active=False`: existem para dar provenance, não
  para aparecer no `Dialog` de busca.
- **Sem `source_url`.** O plano exige que a questão convertida não carregue link
  público. O link que o aluno mandou no envio fica no `ExamSubmission`, visível só
  ao staff; a questão leva o crédito e o `external_id` que torna a reconversão
  idempotente.
"""

from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.questions.ingest import run_items_record
from apps.questions.models import QuestionSource, SearchRun
from apps.questions.naming import normalize_banca
from apps.workspace.models import ExamSubmission

SUBMISSION_KIND = QuestionSource.Kind.LOCAL_FILE
RIGHTS_LICENSE = "Direitos declarados pelo autor do envio"
MAX_CONTENT_BYTES = 2 * 1024 * 1024


def submission_source(submission: ExamSubmission) -> QuestionSource:
    """Fonte de proveniência do envio, criada na primeira conversão."""
    author = submission.user.get_username()
    source, _ = QuestionSource.objects.get_or_create(
        slug=f"envio-{submission.pk}",
        defaults={
            "name": f"Envio de {author} · {submission.title}"[:120],
            "kind": SUBMISSION_KIND,
            "license_name": RIGHTS_LICENSE,
            "attribution": f"Enviado por {author}"[:300],
            "requires_attribution": True,
            "home_url": submission.source_url,
            # Não é fonte de busca: só de procedência.
            "is_active": False,
        },
    )
    return source


def _normalized_items(items, submission: ExamSubmission):
    """Prepara os itens lidos: sem link público e com id próprio do envio.

    O `external_id` vem do envio e não do conteúdo colado. É o que faz a
    reconversão atualizar as mesmas questões em vez de duplicá-las, mesmo que o
    aluno renomeie as tags do XML.
    """
    author = submission.user.get_username()
    normalized = []
    for index, item in enumerate(items, 1):
        item.source_url = ""
        item.banca = normalize_banca(item.banca.strip() or submission.title[:100])
        item.external_id = f"envio{submission.pk}:{item.number or index}"
        if not item.exam_title:
            item.exam_title = f"{submission.title} (envio de {author})"[:160]
        normalized.append(item)
    return normalized


def convert_submission(
    submission: ExamSubmission,
    *,
    content: str = "",
    filename: str = "",
    started_by=None,
    dry_run: bool = False,
    rights_confirmed: bool = False,
) -> SearchRun:
    """Converte o conteúdo colado/enviado de uma prova em `PENDING`.

    Recusa antes de criar qualquer coisa quando a prova ainda não foi revisada ou
    quando ninguém confirmou os direitos: a checagem vem antes do `SearchRun` para
    não sobrar execução vazia no histórico.
    """
    if submission.status != ExamSubmission.Status.REVIEWED:
        raise ValidationError(
            {"status": ["Marque a prova como revisada antes de converter em questões."]}
        )
    if not (submission.rights_confirmed or rights_confirmed):
        raise ValidationError(
            {"rights_confirmed": ["Confirme que o envio tem autorização para virar questão."]}
        )
    body = (content or "").strip()
    if not body:
        raise ValidationError({"content": ["Cole o XML, o JSON ou o CSV da prova."]})
    if len(body.encode("utf-8")) > MAX_CONTENT_BYTES:
        raise ValidationError({"content": ["O conteúdo deve ter no máximo 2 MB."]})

    from apps.questions.ingest.parsers import parse_content

    try:
        items = parse_content(body, filename=filename)
    except (ValueError, KeyError, TypeError) as exc:
        raise ValidationError({"content": [str(exc) or "Conteúdo inválido."]}) from exc
    if not items:
        raise ValidationError({"content": ["Nenhuma questão encontrada no conteúdo."]})

    if rights_confirmed and not submission.rights_confirmed:
        submission.rights_confirmed = True
    source = submission_source(submission)
    if not submission.source_id:
        submission.source = source
    author = submission.user.get_username()
    run_record = run_items_record(
        source,
        _normalized_items(items, submission),
        name=f"Envio de {author} · {submission.title}"[:160],
        filters={"submission": submission.pk},
        started_by=started_by,
        dry_run=dry_run,
        limit=len(items),
    )
    if not dry_run:
        submission.converted_run = run_record
        submission.converted_at = timezone.now()
        submission.converted_questions = run_record.counts.get("created", 0)
        submission.save(
            update_fields=[
                "rights_confirmed",
                "source",
                "converted_run",
                "converted_at",
                "converted_questions",
            ]
        )
    return run_record
