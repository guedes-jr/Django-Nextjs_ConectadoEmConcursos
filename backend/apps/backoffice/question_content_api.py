"""API administrativa para fontes, buscas e fila de questões."""

import json
import zipfile
from tempfile import SpooledTemporaryFile

from django.conf import settings
from django.core.exceptions import ValidationError
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.backoffice.audit import log as audit_log
from apps.questions import moderation
from apps.questions.ingest import run as run_search
from apps.questions.ingest.duplicates import DuplicateChecker, content_hash
from apps.questions.ingest.sources import AdapterNotConfigured, get_adapter
from apps.questions.models import BancaAlias, BancaCatalog, OfficialExamDocument, OfficialExamDownload, OfficialExamPortal, Question, QuestionSource, SearchRun
from apps.questions.queue import QUEUE_PRIORITY_ORDER, annotate_queue_priority
from apps.questions.submissions import convert_submission
from apps.workspace.models import ExamSubmission


def _number(value, default=50, maximum=200):
    try:
        return max(1, min(int(value), maximum))
    except (TypeError, ValueError):
        return default


def _offset(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _source_payload(source):
    return {
        "id": source.id,
        "slug": source.slug,
        "label": source.name,
        "kind": source.kind,
        "license_name": source.license_name,
        "license_url": source.license_url,
        "attribution": source.attribution,
        "requires_attribution": source.requires_attribution,
        "home_url": source.home_url,
        "is_active": source.is_active,
        "last_sync_at": source.last_sync_at,
        "facets_at": source.facets_at,
    }


def _source_catalog_payload(source):
    """Dados para descoberta: fontes inativas aparecem, mas não podem importar."""
    payload = _source_payload(source)
    payload.update({
        "ready_for_import": bool(source.is_active and source.license_name),
        "availability": "ready" if source.is_active and source.license_name else (
            "missing_license" if source.is_active else "inactive"
        ),
        "availability_message": (
            "Pronta para buscar e enviar questões à fila."
            if source.is_active and source.license_name
            else "Cadastre a licença antes de ativar esta fonte."
            if source.is_active
            else "Fonte catalogada. Configure e ative-a antes de importar."
        ),
        "questions_total": getattr(source, "questions_total", 0),
        "pending_total": getattr(source, "pending_total", 0),
        "runs_total": getattr(source, "runs_total", 0),
    })
    return payload


def _run_payload(run):
    return {
        "id": run.id,
        "name": run.name,
        "source": run.source.slug,
        "filters": run.filters,
        "fingerprint": run.fingerprint,
        "status": run.status,
        "next_page": run.next_page,
        "limit": run.limit,
        "counts": run.counts,
        "duplicates_preview": run.duplicates_preview,
        "log_path": run.log_path,
        "parent": run.parent_id,
        "started_by": run.started_by.username if run.started_by else None,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "duration_ms": run.duration_ms,
        "questions_count": getattr(run, "questions_count", None),
    }


def _duplicates(checker, question) -> list[dict]:
    """Questões parecidas com a que está em revisão, com score e conflito de gabarito.

    É a mesma comparação do pipeline (`DuplicateChecker`), sem gravar nada: a fila
    precisa mostrar "87% igual a #123, gabarito C ≠ E" para o admin decidir.
    """
    if checker is None:
        return []
    matches = checker.matches(
        question.statement,
        question.options,
        question.correct_answer,
        exclude_ids=[question.pk],
    )
    return [
        {
            "id": match.question_id,
            "score": round(match.score, 4),
            "percent": match.percent,
            "exact": match.exact_hash,
            "answer_conflict": match.answer_conflict,
        }
        for match in matches
    ]


def _question_payload(question, duplicates: list[dict] | None = None):
    source = question.source
    duplicates = duplicates if duplicates is not None else _duplicates(_checker(), question)
    return {
        "id": question.id,
        "search_run": question.search_run_id,
        "status": question.status,
        "statement": question.statement,
        "options": question.options,
        "correct_answer": question.correct_answer,
        "explanation": question.explanation,
        "discipline": question.discipline,
        "banca": question.banca,
        "year": question.year,
        "number": question.number,
        "exam": question.exam.title if question.exam else None,
        "exam_id": question.exam_id,
        "external_id": question.external_id,
        "content_hash": question.content_hash
        or content_hash(question.statement, question.options),
        "source_url": question.source_url,
        "source": _source_payload(source) if source else None,
        "origin": "manual" if source and source.slug == MANUAL_SOURCE_SLUG else "imported",
        "created_by": question.created_by.username if question.created_by else None,
        "imported_by": question.search_run.started_by.username if question.search_run and question.search_run.started_by else None,
        "added_by": question.created_by.username if question.created_by else (question.search_run.started_by.username if question.search_run and question.search_run.started_by else None),
        "review_note": question.review_note,
        "duplicates": duplicates,
        "conflict": any(item["answer_conflict"] for item in duplicates),
        "rejection_reason": question.rejection_reason,
        "rejection_reason_code": question.rejection_reason_code,
        "reviewed_by": question.reviewed_by.username if question.reviewed_by else None,
        "reviewed_at": question.reviewed_at,
        "updated_at": question.updated_at,
    }


def _checker():
    """Um `DuplicateChecker` por requisição: as frequências de token são carregadas uma vez."""
    return DuplicateChecker(with_hash_index=True)


def _source_or_404(slug, active_only=True):
    queryset = QuestionSource.objects.all()
    if active_only:
        queryset = queryset.filter(is_active=True)
    return queryset.filter(slug=slug).first()


def _validation_response(exc):
    if hasattr(exc, "message_dict"):
        return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": "; ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def sources(request):
    queryset = QuestionSource.objects.filter(is_active=True).order_by("name")
    return Response({"results": [_source_payload(source) for source in queryset]})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def source_catalog(request):
    """Catálogo completo, separado da lista operacional usada pela busca."""
    queryset = QuestionSource.objects.annotate(
        questions_total=Count("questions", distinct=True),
        pending_total=Count("questions", filter=Q(questions__status=Question.Status.PENDING), distinct=True),
        runs_total=Count("runs", distinct=True),
    ).order_by("name")
    return Response({"results": [_source_catalog_payload(source) for source in queryset]})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def source_filters(request, slug):
    source = _source_or_404(slug)
    if not source:
        return Response({"detail": "Fonte não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    try:
        current = json.loads(request.query_params.get("current", "{}"))
        if not isinstance(current, dict):
            raise ValueError
    except ValueError:
        return Response({"current": ["Informe um objeto JSON válido."]}, status=status.HTTP_400_BAD_REQUEST)
    try:
        adapter = get_adapter(source)
        result = []
        for spec in adapter.filters():
            result.append({
                "key": spec.key, "label": spec.label, "kind": spec.kind,
                "param": spec.param, "options_from": spec.options_from,
                "multiple": spec.multiple, "required": spec.required,
                "help_text": spec.help_text,
                "options": [option.__dict__ for option in adapter.list_options(spec, current)],
            })
    except AdapterNotConfigured as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response({"source": _source_payload(source), "filters": result})


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def question_search(request):
    if request.method == "POST":
        source_slug = request.data.get("source")
        if not isinstance(source_slug, str) or not source_slug.strip():
            return Response({"source": ["Informe o slug de uma única fonte."]}, status=status.HTTP_400_BAD_REQUEST)
        source = _source_or_404(source_slug.strip())
        if not source:
            return Response({"source": ["Fonte ativa não encontrada."]}, status=status.HTTP_404_NOT_FOUND)
        filters = request.data.get("filters", {})
        if not isinstance(filters, dict):
            return Response({"filters": ["Use um objeto JSON." ]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            run = run_search(source, filters, limit=_number(request.data.get("limit"), 200, 1000), started_by=request.user, dry_run=bool(request.data.get("dry_run", False)))
        except ValidationError as exc:
            return _validation_response(exc)
        except AdapterNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        payload = _run_payload(run)
        audit_log(request, action="question_search.started", resource_type="search_run", resource_id=run.id, after={"source": source.slug, "dry_run": run.dry_run, "limit": run.limit})
        return Response(payload, status=status.HTTP_201_CREATED)

    queryset = SearchRun.objects.select_related("source", "started_by", "parent").order_by("-started_at")
    if source := request.query_params.get("source"):
        queryset = queryset.filter(source__slug=source)
    if fingerprint := request.query_params.get("fingerprint"):
        queryset = queryset.filter(fingerprint=fingerprint)
    limit, offset = _number(request.query_params.get("limit")), _offset(request.query_params.get("offset"))
    total = queryset.count()
    return Response({"total": total, "limit": limit, "offset": offset, "results": [_run_payload(run) for run in queryset[offset:offset + limit]]})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def question_search_detail(request, pk):
    run = SearchRun.objects.select_related("source", "started_by", "parent").filter(pk=pk).first()
    if not run:
        return Response({"detail": "Busca não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    payload = _run_payload(run)
    payload["questions_count"] = run.questions.count()
    # "74% concluído" na tela do revisor: o que já saiu de PENDING nesta busca.
    payload["reviewed_count"] = run.questions.exclude(status=Question.Status.PENDING).count()
    return Response(payload)


def _run_limit(request, parent: SearchRun) -> int:
    """Limite da próxima parte.

    Sem isso o cursor não reproduz a busca: `next_page=2` só faz sentido com o
    mesmo `limit` da execução original, então o valor do pai é o padrão e o corpo
    da requisição só o substitui quando vem explícito.
    """
    if "limit" not in request.data:
        return parent.limit
    return _number(request.data.get("limit"), parent.limit, 1000)


def _resume_run(request, pk, page):
    parent = SearchRun.objects.select_related("source").filter(pk=pk).first()
    if not parent:
        return Response({"detail": "Busca não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    try:
        run = run_search(parent.source, parent.filters, limit=_run_limit(request, parent), page=page, started_by=request.user, parent=parent, dry_run=bool(request.data.get("dry_run", False)))
    except ValidationError as exc:
        return _validation_response(exc)
    except AdapterNotConfigured as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    payload = _run_payload(run)
    audit_log(request, action="question_search.resumed", resource_type="search_run", resource_id=run.id, after={"parent": parent.id, "page": page, "dry_run": run.dry_run})
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def question_search_continue(request, pk):
    run = SearchRun.objects.filter(pk=pk).only("next_page").first()
    if not run:
        return Response({"detail": "Busca não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if not run.next_page:
        return Response({"detail": "Esta busca não possui próxima página."}, status=status.HTTP_409_CONFLICT)
    return _resume_run(request, pk, run.next_page)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def question_search_rerun(request, pk):
    return _resume_run(request, pk, 1)


DUPLICATE_SCAN_LIMIT = 300


def _filter_by_duplicates(queryset, params, order=QUEUE_PRIORITY_ORDER):
    """Filtra a fila por "tem duplicata" ou "gabarito conflita".

    Não existe coluna para isso: a comparação vive no `DuplicateChecker`, que
    precisa do enunciado e das alternativas, uma consulta por questão. A varredura
    é limitada a `DUPLICATE_SCAN_LIMIT` questões do topo da fila — é o recorte que
    o revisor está olhando, e auditar mais que isso é para a busca por `SearchRun`.
    """
    checker = _checker()
    conflict_only = bool(params.get("conflict"))
    scanned = queryset.order_by(*order).values_list("id", flat=True)[:DUPLICATE_SCAN_LIMIT]
    keep = set()
    for question in Question.objects.filter(id__in=list(scanned)):
        matches = _duplicates(checker, question)
        if conflict_only:
            if any(match["answer_conflict"] for match in matches):
                keep.add(question.id)
        elif matches:
            keep.add(question.id)
    return queryset.filter(id__in=keep)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def questions_queue(request):
    # Mesma prioridade do admin (`apps/questions/queue.py`): se as duas telas
    # divergirem, o revisor corrige uma questão e a API entrega outra.
    queryset = annotate_queue_priority(
        Question.objects.select_related("source", "exam", "reviewed_by", "search_run")
    )
    status_filter = request.query_params.get("status", Question.Status.PENDING)
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if source := request.query_params.get("source"):
        queryset = queryset.filter(source__slug=source)
    # Dentro de uma busca a ordem é a de chegada (FIFO por `id`): o revisor segue a
    # execução do começo ao fim. Sem busca, vale a prioridade da fila compartilhada.
    order = QUEUE_PRIORITY_ORDER
    if search_run := request.query_params.get("search_run"):
        queryset = queryset.filter(search_run_id=search_run)
        order = ("id",)
    if banca := request.query_params.get("banca"):
        queryset = queryset.filter(banca__iexact=banca)
    if discipline := request.query_params.get("discipline"):
        queryset = queryset.filter(discipline__iexact=discipline)
    if year := request.query_params.get("year"):
        queryset = queryset.filter(year=year)
    if search := request.query_params.get("search"):
        queryset = queryset.filter(Q(statement__icontains=search) | Q(explanation__icontains=search))
    if request.query_params.get("duplicates") or request.query_params.get("conflict"):
        queryset = _filter_by_duplicates(queryset, request.query_params, order)
    limit, offset = _number(request.query_params.get("limit")), _offset(request.query_params.get("offset"))
    queryset = queryset.order_by(*order)
    total = queryset.count()
    checker = _checker()
    results = [
        _question_payload(question, _duplicates(checker, question))
        for question in queryset[offset : offset + limit]
    ]
    return Response({"total": total, "limit": limit, "offset": offset, "results": results})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def questions_queue_next(request):
    queryset = Question.objects.select_related("source", "exam", "reviewed_by", "search_run").filter(status=Question.Status.PENDING).order_by("id")
    if search_run := request.query_params.get("search_run"):
        queryset = queryset.filter(search_run_id=search_run)
    if cursor := request.query_params.get("cursor"):
        queryset = queryset.filter(id__gt=cursor)
    question = queryset.first()
    if not question:
        return Response({"detail": "Fila em dia."}, status=status.HTTP_404_NOT_FOUND)
    duplicates = _duplicates(_checker(), question)
    return Response(
        {"cursor": question.id, "question": _question_payload(question, duplicates)}
    )


def _question_ids(data):
    ids = data.get("ids", data.get("id"))
    if isinstance(ids, int):
        return [ids]
    if isinstance(ids, list) and ids and all(isinstance(item, int) for item in ids):
        return ids
    return []


def _stale(request, question) -> bool:
    """Bloqueio otimista: a tela manda o `updated_at` que leu e a API compara.

    Dois revisores na mesma questão ao mesmo tempo é o caso normal de uma fila
    grande; sem isso, o segundo "aprovar" sobrescreveria o comentário do primeiro
    sem ninguém perceber. Só compara quando a tela enviou o valor.
    """
    sent = request.data.get("updated_at")
    if not sent:
        return False
    try:
        sent_at = parse_datetime(str(sent))
    except (TypeError, ValueError):
        return False
    if sent_at is None:
        return False
    if timezone.is_naive(sent_at):
        sent_at = timezone.make_aware(sent_at, timezone.get_default_timezone())
    return question.updated_at and sent_at < question.updated_at


def _moderate(request, action):
    ids = _question_ids(request.data)
    if not ids:
        return Response({"id": ["Informe uma questão ou uma lista de questões."]}, status=status.HTTP_400_BAD_REQUEST)
    questions = list(Question.objects.filter(id__in=ids).select_related("reviewed_by"))
    if len(questions) != len(set(ids)):
        return Response({"id": ["Uma ou mais questões não foram encontradas."]}, status=status.HTTP_404_NOT_FOUND)
    changed = []
    for question in questions:
        if question.status != Question.Status.PENDING:
            return Response(
                {
                    "detail": f"A questão #{question.id} já foi revisada.",
                    "code": "already_reviewed",
                    "status": question.status,
                },
                status=status.HTTP_409_CONFLICT,
            )
        if _stale(request, question):
            return Response(
                {
                    "detail": "Esta questão foi atualizada por outro revisor.",
                    "code": "stale",
                    "status": question.status,
                },
                status=status.HTTP_409_CONFLICT,
            )
        try:
            if action == "approve":
                moderation.approve(question, request.user, request.data.get("explanation"))
            else:
                moderation.reject(question, request.user, request.data.get("reason"), request.data.get("reason_code"))
        except ValidationError as exc:
            return _validation_response(exc)
        payload = _question_payload(question, [])
        audit_log(request, action=f"question.{action}d", resource_type="question", resource_id=question.id, before={"status": Question.Status.PENDING}, after={"status": question.status, "review_note": question.review_note}, reason=str(request.data.get("reason") or request.data.get("reason_code") or ""))
        changed.append(payload)
    return Response({"results": changed})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def questions_draft(request):
    """Rascunho do revisor: anota o texto sem aprovar nem reprovar.

    Digitar um comentário de 120 caracteres leva tempo e `S` salva o que já está na
    tela, para o revisor não perder o raciocínio ao trocar de questão.
    """
    ids = _question_ids(request.data)
    if not ids:
        return Response({"id": ["Informe uma questão ou uma lista de questões."]}, status=status.HTTP_400_BAD_REQUEST)
    questions = list(Question.objects.filter(id__in=ids))
    if len(questions) != len(set(ids)):
        return Response({"id": ["Uma ou mais questões não foram encontradas."]}, status=status.HTTP_404_NOT_FOUND)
    note = str(request.data.get("note", ""))
    for question in questions:
        question.review_note = note
        question.save(update_fields=["review_note", "updated_at"])
    return Response({"results": [_question_payload(question, []) for question in questions]})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def rejection_reasons(request):
    """Motivos estruturados de rejeição: o formulário do admin monta a lista daqui."""
    return Response(
        [
            {"code": code, "label": label}
            for code, label in sorted(moderation.REJECTION_REASONS.items(), key=lambda item: item[1])
        ]
    )


@api_view(["POST"])
@permission_classes([IsAdminUser])
def questions_approve(request):
    return _moderate(request, "approve")


@api_view(["POST"])
@permission_classes([IsAdminUser])
def questions_reject(request):
    return _moderate(request, "reject")


@api_view(["POST"])
@permission_classes([IsAdminUser])
def question_search_import_skipped(request, pk):
    parent = SearchRun.objects.select_related("source").filter(pk=pk).first()
    if not parent:
        return Response({"detail": "Busca não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if not (parent.duplicates_preview or (parent.counts or {}).get("duplicates_skipped")):
        return Response({"detail": "Esta busca não possui duplicatas descartadas."}, status=status.HTTP_409_CONFLICT)
    try:
        run = run_search(
            parent.source,
            parent.filters,
            limit=_run_limit(request, parent),
            page=1,
            started_by=request.user,
            parent=parent,
            dry_run=bool(request.data.get("dry_run", False)),
            force_duplicates=True,
        )
    except ValidationError as exc:
        return _validation_response(exc)
    except AdapterNotConfigured as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response(_run_payload(run), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def proofs_convert(request):
    """Converte a prova enviada pelo aluno em questões, pelo mesmo pipeline das fontes.

    Aceita o conteúdo colado no formulário ou um arquivo XML/JSON/CSV — o PDF que o
    aluno mandou não é parseável, então quem converte é quem transcreve. A prova
    precisa estar revisada: é o mesmo gate das outras telas de curadoria.
    """
    submission = ExamSubmission.objects.filter(pk=request.data.get("id")).first()
    if not submission:
        return Response({"detail": "Prova não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    content = str(request.data.get("content", ""))
    filename = str(request.data.get("filename", ""))
    upload = request.FILES.get("file")
    if upload is not None:
        if upload.size > 2 * 1024 * 1024:
            return Response({"content": ["O arquivo deve ter no máximo 2 MB."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            content = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return Response({"content": ["O arquivo precisa estar em UTF-8."]}, status=status.HTTP_400_BAD_REQUEST)
        filename = upload.name
    try:
        run_record = convert_submission(
            submission,
            content=content,
            filename=filename,
            started_by=request.user,
            dry_run=bool(request.data.get("dry_run", False)),
            rights_confirmed=str(request.data.get("rights_confirmed", "")).strip().lower() in {"true", "1", "on", "yes"},
        )
    except ValidationError as exc:
        return _validation_response(exc)
    payload = _run_payload(run_record)
    payload["submission"] = {
        "id": submission.id,
        "title": submission.title,
        "username": submission.user.get_username(),
        "converted_questions": submission.converted_questions,
        "converted_at": submission.converted_at.isoformat() if submission.converted_at else None,
    }
    return Response(payload, status=status.HTTP_201_CREATED)


def _portal_payload(portal):
    return {"id": portal.id, "slug": portal.slug, "name": portal.name, "catalog_url": portal.catalog_url, "notes": portal.notes, "is_active": portal.is_active, "documents_count": getattr(portal, "documents_count", 0)}


def _workflow_status(document):
    if document.kind != OfficialExamDocument.Kind.EXAM:
        return "answer_key"
    if not document.paired_with_id:
        return "answer_key_pending"
    if document.status == OfficialExamDocument.Status.DOWNLOADED and document.paired_with.status == OfficialExamDocument.Status.DOWNLOADED:
        return "ready_manual"
    return "paired"


def _document_payload(document):
    latest = document.downloads.order_by("-created_at").first()
    return {"id": document.id, "portal": document.portal.slug, "portal_name": document.portal.name, "title": document.title, "year": document.year, "organization": document.organization, "role": document.role, "kind": document.kind, "status": document.status, "source_url": document.source_url, "paired_with": document.paired_with_id, "workflow_status": _workflow_status(document), "created_at": document.created_at, "download": {"status": latest.status, "bytes": latest.bytes_count, "sha256": latest.sha256, "error": latest.error_message, "finished_at": latest.finished_at, "final_url": latest.final_url} if latest else None}


@api_view(["GET"])
@permission_classes([IsAdminUser])
def official_exam_portals(request):
    portals = OfficialExamPortal.objects.annotate(documents_count=Count("documents")).order_by("name")
    return Response({"results": [_portal_payload(portal) for portal in portals]})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def official_exam_metrics(request):
    downloads = OfficialExamDownload.objects.all()
    completed = list(downloads.filter(finished_at__isnull=False).only("created_at", "finished_at").order_by("-finished_at")[:500])
    durations = [(item.finished_at - item.created_at).total_seconds() for item in completed if item.finished_at]
    return Response({
        "documents": OfficialExamDocument.objects.count(),
        "discovered": OfficialExamDocument.objects.filter(status=OfficialExamDocument.Status.DISCOVERED).count(),
        "downloads_done": downloads.filter(status=OfficialExamDownload.Status.DONE).count(),
        "downloads_failed": downloads.filter(status=OfficialExamDownload.Status.FAILED).count(),
        "downloads_running": downloads.filter(status=OfficialExamDownload.Status.RUNNING).count(),
        "average_duration_seconds": round(sum(durations) / len(durations), 1) if durations else None,
    })

@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def official_exam_documents(request):
    if request.method == "POST":
        portal = OfficialExamPortal.objects.filter(slug=request.data.get("portal"), is_active=True).first()
        if not portal:
            return Response({"portal": ["Escolha um portal oficial ativo."]}, status=status.HTTP_400_BAD_REQUEST)
        title = str(request.data.get("title", "")).strip()
        if not title:
            return Response({"title": ["Informe um título para o documento."]}, status=status.HTTP_400_BAD_REQUEST)
        source_url = str(request.data.get("source_url", "")).strip()
        if not source_url.startswith(("https://", "http://")):
            return Response({"source_url": ["Informe uma URL HTTP(S) oficial."]}, status=status.HTTP_400_BAD_REQUEST)
        from urllib.parse import urlparse
        if portal.allowed_hosts and urlparse(source_url).hostname not in portal.allowed_hosts:
            return Response({"source_url": ["A URL não pertence ao domínio permitido para este portal."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            document = OfficialExamDocument.objects.create(portal=portal, title=title, year=request.data.get("year") or None, organization=str(request.data.get("organization", "")).strip(), role=str(request.data.get("role", "")).strip(), kind=request.data.get("kind"), source_url=source_url, status=OfficialExamDocument.Status.REVIEW)
        except (ValidationError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_document_payload(document), status=status.HTTP_201_CREATED)
    documents = OfficialExamDocument.objects.select_related("portal", "paired_with").order_by("-created_at")
    if portal := request.query_params.get("portal"):
        documents = documents.filter(portal__slug=portal)
    if kind := request.query_params.get("kind"):
        documents = documents.filter(kind=kind)
    if document_status := request.query_params.get("status"):
        documents = documents.filter(status=document_status)
    if year := request.query_params.get("year"):
        try:
            documents = documents.filter(year=int(year))
        except ValueError:
            return Response({"year": ["Informe um ano válido."]}, status=status.HTTP_400_BAD_REQUEST)
    if organization := request.query_params.get("organization"):
        documents = documents.filter(organization__icontains=organization)
    if role := request.query_params.get("role"):
        documents = documents.filter(role__icontains=role)
    return Response({"results": [_document_payload(document) for document in documents[:200]]})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def official_exam_export(request):
    documents = OfficialExamDocument.objects.select_related("portal", "paired_with").prefetch_related("downloads").order_by("portal__name", "-year", "title")
    if portal := request.query_params.get("portal"):
        documents = documents.filter(portal__slug=portal)
    if kind := request.query_params.get("kind"):
        documents = documents.filter(kind=kind)
    if document_status := request.query_params.get("status"):
        documents = documents.filter(status=document_status)
    if year := request.query_params.get("year"):
        try:
            documents = documents.filter(year=int(year))
        except ValueError:
            return Response({"year": ["Informe um ano válido."]}, status=status.HTTP_400_BAD_REQUEST)
    if organization := request.query_params.get("organization"):
        documents = documents.filter(organization__icontains=organization)
    if role := request.query_params.get("role"):
        documents = documents.filter(role__icontains=role)
    documents = documents[:500]
    payload = []
    for document in documents:
        latest = max(document.downloads.all(), key=lambda item: item.created_at, default=None)
        payload.append({
            "id": document.id, "portal": document.portal.name, "title": document.title,
            "year": document.year, "organization": document.organization, "role": document.role,
            "kind": document.kind, "status": document.status, "source_url": document.source_url,
            "paired_with": document.paired_with_id,
            "download": {"status": latest.status, "sha256": latest.sha256, "bytes": latest.bytes_count, "final_url": latest.final_url} if latest else None,
        })
    package = {"format": "official-exam-manual-package/v1", "generated_at": timezone.now().isoformat(), "count": len(payload), "documents": payload}
    if request.query_params.get("include_files") not in {"1", "true"}:
        return Response(package)

    ready = [item for item in documents if (latest := max(item.downloads.all(), key=lambda row: row.created_at, default=None)) and latest.status == OfficialExamDownload.Status.DONE and latest.file]
    total_bytes = sum(max(item.downloads.filter(status=OfficialExamDownload.Status.DONE).order_by("-created_at").first().bytes_count, 0) for item in ready)
    max_files = int(getattr(settings, "OFFICIAL_EXAM_EXPORT_MAX_FILES", 50))
    max_bytes = int(getattr(settings, "OFFICIAL_EXAM_EXPORT_MAX_BYTES", 500 * 1024 * 1024))
    if len(ready) > max_files or total_bytes > max_bytes:
        return Response({"detail": f"O pacote excede o limite de {max_files} PDFs ou {max_bytes // (1024 * 1024)} MB. Refine os filtros."}, status=status.HTTP_400_BAD_REQUEST)
    archive = SpooledTemporaryFile(max_size=5 * 1024 * 1024, mode="w+b")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
        zipped.writestr("manifest.json", json.dumps(package, ensure_ascii=False, indent=2))
        for item in ready:
            latest = item.downloads.filter(status=OfficialExamDownload.Status.DONE).order_by("-created_at").first()
            filename = f"pdfs/{item.id}-{latest.sha256[:12] or latest.id}.pdf"
            with latest.file.open("rb") as source, zipped.open(filename, "w") as target:
                for chunk in iter(lambda: source.read(64 * 1024), b""):
                    target.write(chunk)
    archive.seek(0)
    response = FileResponse(archive, as_attachment=True, filename="acervo-provas-oficiais.zip", content_type="application/zip")
    response["X-Official-Exam-Package"] = "manual-package-v1"
    return response

@api_view(["POST"])
@permission_classes([IsAdminUser])
def official_exam_discover(request, slug):
    portal = OfficialExamPortal.objects.filter(slug=slug, is_active=True).first()
    if not portal:
        return Response({"detail": "Portal oficial não encontrado ou inativo."}, status=status.HTTP_404_NOT_FOUND)
    from apps.questions.official_exam_discovery import discover
    try:
        result = discover(portal, persist=bool(request.data.get("persist")))
    except ValidationError as exc:
        return _validation_response(exc)
    return Response({"detail": f"Consulta concluída: {result['created']} referência(s) nova(s), {result['skipped']} já existente(s)." if request.data.get("persist") else f"Prévia pronta: {len(result['candidates'])} documento(s) encontrado(s).", **result})

@api_view(["POST"])
@permission_classes([IsAdminUser])
def official_exam_download(request, pk):
    document = OfficialExamDocument.objects.select_related("portal").filter(pk=pk).first()
    if not document:
        return Response({"detail": "Documento não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if OfficialExamDownload.objects.filter(document=document, status=OfficialExamDownload.Status.DONE).exists() and not bool(request.data.get("force")):
        return Response({"code": "confirm_repeat", "detail": "Já existe um PDF baixado. Confirme para registrar uma nova tentativa sem apagar o histórico."}, status=status.HTTP_409_CONFLICT)
    from apps.questions.official_exam_downloads import create_download
    try:
        result = create_download(document, request.user)
        from django_q.tasks import async_task
        async_task("apps.questions.official_exam_downloads.run", result.id)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    except Exception as exc:
        result.status = OfficialExamDownload.Status.FAILED
        result.error_message = "Não foi possível enviar o download para a fila."
        result.finished_at = timezone.now()
        result.save(update_fields=["status", "error_message", "finished_at"])
        return Response({"detail": "Não foi possível enviar o download para a fila."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    payload = {"id": result.id, "status": result.status, "detail": "Download enviado para processamento."}
    audit_log(request, action="official_exam.download_requested", resource_type="official_exam_document", resource_id=document.id, after={"download_id": result.id, "portal": document.portal.slug})
    return Response(payload, status=status.HTTP_202_ACCEPTED)

@api_view(["GET"])
@permission_classes([IsAdminUser])
def official_exam_file(request, pk):
    record = OfficialExamDownload.objects.filter(document_id=pk, status=OfficialExamDownload.Status.DONE).exclude(file="").order_by("-created_at").first()
    if not record:
        return Response({"detail": "Não há PDF baixado para este documento."}, status=status.HTTP_404_NOT_FOUND)
    if not record.file.storage.exists(record.file.name):
        return Response({"detail": "O arquivo privado não está disponível no armazenamento."}, status=status.HTTP_404_NOT_FOUND)
    return FileResponse(record.file.open("rb"), as_attachment=True, filename=f"documento-{pk}.pdf", content_type="application/pdf")

@api_view(["GET", "DELETE"])
@permission_classes([IsAdminUser])
def official_exam_document_detail(request, pk):
    document = OfficialExamDocument.objects.select_related("portal").filter(pk=pk).first()
    if not document:
        return Response({"detail": "Documento não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        events = document.downloads.order_by("-created_at")
        return Response({**_document_payload(document), "events": [{"id": item.id, "status": item.status, "http_status": item.http_status, "bytes": item.bytes_count, "sha256": item.sha256, "final_url": item.final_url, "error": item.error_message, "created_at": item.created_at, "finished_at": item.finished_at} for item in events]})
    if document.downloads.filter(status=OfficialExamDownload.Status.DONE).exists():
        return Response({"detail": "Documentos já baixados não podem ser descartados, para preservar a auditoria."}, status=status.HTTP_409_CONFLICT)
    if document.paired_with_id:
        OfficialExamDocument.objects.filter(pk=document.paired_with_id, paired_with_id=document.pk).update(paired_with=None)
    document.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(["POST"])
@permission_classes([IsAdminUser])
def official_exam_pair(request, pk):
    document = OfficialExamDocument.objects.select_related("portal").filter(pk=pk).first()
    pair = OfficialExamDocument.objects.select_related("portal").filter(pk=request.data.get("paired_with")).first()
    if not document or not pair:
        return Response({"detail": "Informe documentos existentes para o pareamento."}, status=status.HTTP_400_BAD_REQUEST)
    if document.pk == pair.pk or document.portal_id != pair.portal_id:
        return Response({"detail": "Prova e gabarito devem ser documentos diferentes do mesmo portal."}, status=status.HTTP_400_BAD_REQUEST)
    if document.kind == pair.kind or (document.kind != OfficialExamDocument.Kind.EXAM and pair.kind != OfficialExamDocument.Kind.EXAM):
        return Response({"detail": "Associe uma prova a um gabarito preliminar ou final."}, status=status.HTTP_400_BAD_REQUEST)
    if document.paired_with_id and document.paired_with_id != pair.pk:
        return Response({"detail": "Este documento já está associado. Desfaça ou ajuste a associação antes de continuar."}, status=status.HTTP_400_BAD_REQUEST)
    if pair.paired_with_id and pair.paired_with_id != document.pk:
        return Response({"detail": "O documento selecionado já está associado a outro item."}, status=status.HTTP_400_BAD_REQUEST)
    document.paired_with = pair
    document.save(update_fields=["paired_with", "updated_at"])
    if pair.paired_with_id != document.pk:
        pair.paired_with = document
        pair.save(update_fields=["paired_with", "updated_at"])
    payload = _document_payload(document)
    audit_log(request, action="official_exam.paired", resource_type="official_exam_document", resource_id=document.id, after={"paired_with": pair.id, "portal": document.portal.slug})
    return Response(payload)

# Catálogo de bancas: deliberadamente separado das fontes de questões. Ele apenas
# padroniza nomes para os próximos cadastros e não reescreve registros existentes.
def _banca_payload(banca, include_aliases=True):
    payload = {
        "id": banca.id,
        "name": banca.name,
        "slug": banca.slug,
        "official_url": banca.official_url,
        "description": banca.description,
        "image_url": banca.image_url,
        "is_active": banca.is_active,
        "is_featured": banca.is_featured,
        "created_by": banca.created_by.get_username() if banca.created_by else None,
        "updated_by": banca.updated_by.get_username() if banca.updated_by else None,
        "created_at": banca.created_at,
        "updated_at": banca.updated_at,
        # Contagens são informativas: dados antigos continuam texto livre.
        "questions_count": Question.objects.filter(banca__iexact=banca.name).count(),
    }
    from apps.questions.models import Exam
    payload["exams_count"] = Exam.objects.filter(banca__iexact=banca.name).count()
    if include_aliases:
        payload["aliases"] = [
            {"id": alias.id, "alias": alias.alias, "created_at": alias.created_at}
            for alias in banca.aliases.all()
        ]
    return payload


def _banca_write(banca, data, user):
    writable = ("name", "slug", "official_url", "description", "image_url", "is_active", "is_featured")
    for field in writable:
        if field not in data:
            continue
        value = data[field]
        if field in {"is_active", "is_featured"}:
            if not isinstance(value, bool):
                raise ValidationError({field: "Informe verdadeiro ou falso."})
        elif not isinstance(value, str):
            raise ValidationError({field: "Informe um texto válido."})
        setattr(banca, field, value.strip() if isinstance(value, str) else value)
    banca.updated_by = user
    banca.save()
    return banca


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def bancas(request):
    if request.method == "POST":
        name = request.data.get("name")
        if not isinstance(name, str) or not name.strip():
            return Response({"name": ["Informe o nome canônico da banca."]}, status=status.HTTP_400_BAD_REQUEST)
        banca = BancaCatalog(created_by=request.user, updated_by=request.user)
        try:
            _banca_write(banca, request.data, request.user)
        except ValidationError as exc:
            return _validation_response(exc)
        payload = _banca_payload(banca)
        audit_log(request, action="banca.created", resource_type="banca", resource_id=banca.id, after=payload)
        return Response(payload, status=status.HTTP_201_CREATED)

    queryset = BancaCatalog.objects.prefetch_related("aliases", "created_by", "updated_by").order_by("name")
    if request.query_params.get("active") in {"0", "1"}:
        queryset = queryset.filter(is_active=request.query_params["active"] == "1")
    if search := request.query_params.get("search", "").strip():
        queryset = queryset.filter(Q(name__icontains=search) | Q(aliases__alias__icontains=search)).distinct()
    limit, offset = _number(request.query_params.get("limit")), _offset(request.query_params.get("offset"))
    total = queryset.count()
    page = queryset[offset:offset + limit]
    return Response({"total": total, "limit": limit, "offset": offset, "results": [_banca_payload(item) for item in page]})


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminUser])
def banca_detail(request, pk):
    banca = BancaCatalog.objects.prefetch_related("aliases", "created_by", "updated_by").filter(pk=pk).first()
    if not banca:
        return Response({"detail": "Banca não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        return Response(_banca_payload(banca))
    before = _banca_payload(banca)
    try:
        _banca_write(banca, request.data, request.user)
    except ValidationError as exc:
        return _validation_response(exc)
    payload = _banca_payload(banca)
    audit_log(request, action="banca.updated", resource_type="banca", resource_id=banca.id, before=before, after=payload)
    return Response(payload)


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def banca_aliases(request, pk):
    banca = BancaCatalog.objects.prefetch_related("aliases").filter(pk=pk).first()
    if not banca:
        return Response({"detail": "Banca não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        return Response({"results": [{"id": item.id, "alias": item.alias, "created_at": item.created_at} for item in banca.aliases.all()]})
    alias_value = request.data.get("alias")
    if not isinstance(alias_value, str) or not alias_value.strip():
        return Response({"alias": ["Informe uma grafia alternativa."]}, status=status.HTTP_400_BAD_REQUEST)
    try:
        alias = BancaAlias.objects.create(banca=banca, alias=alias_value)
    except ValidationError as exc:
        return _validation_response(exc)
    payload = {"id": alias.id, "alias": alias.alias, "created_at": alias.created_at}
    audit_log(request, action="banca.alias_added", resource_type="banca", resource_id=banca.id, after={"alias": alias.alias})
    return Response(payload, status=status.HTTP_201_CREATED)

MANUAL_SOURCE_SLUG = "manual"

def _manual_source():
    source, _ = QuestionSource.objects.get_or_create(slug=MANUAL_SOURCE_SLUG, defaults={"name": "Cadastro manual", "kind": QuestionSource.Kind.LOCAL_FILE, "license_name": "Cadastro interno", "is_active": False})
    return source

def _manual_question_validate(data, exclude_id=None):
    errors = {}; statement = str(data.get("statement", "")).strip(); banca = str(data.get("banca", "")).strip(); discipline = str(data.get("discipline", "")).strip(); reference = str(data.get("source_url", "")).strip(); options = data.get("options", []); answer = data.get("correct_answer")
    if not statement: errors["statement"] = ["Informe o enunciado."]
    if not banca: errors["banca"] = ["Informe a banca."]
    if not discipline: errors["discipline"] = ["Informe a disciplina."]
    if reference and not reference.startswith(("https://", "http://")): errors["source_url"] = ["Informe uma URL de referência HTTP(S) ou deixe o campo em branco."]
    if not isinstance(options, list) or len(options) < 2 or any(not isinstance(x, str) or not x.strip() for x in options): errors["options"] = ["Informe ao menos duas alternativas preenchidas."]
    if not isinstance(answer, int) or not isinstance(options, list) or answer < 0 or answer >= len(options): errors["correct_answer"] = ["Escolha uma alternativa válida como gabarito."]
    if statement and banca and data.get("year") and Question.objects.filter(statement=statement, banca=banca, year=data["year"]).exclude(pk=exclude_id).exists(): errors["statement"] = ["Já existe uma questão com este enunciado, banca e ano."]
    if errors: raise ValidationError(errors)

def _manual_question_write(question, data):
    _manual_question_validate(data, question.pk)
    for field in ("statement", "banca", "discipline", "year", "options", "correct_answer", "explanation", "source_url", "number"):
        if field in data: setattr(question, field, data[field].strip() if isinstance(data[field], str) else data[field])
    if "exam" in data: question.exam_id = data["exam"] or None
    question.save()
    return question

@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def manual_questions(request):
    if request.method == "POST":
        question = Question(source=_manual_source(), created_by=request.user, status=Question.Status.DRAFT)
        try: _manual_question_write(question, request.data)
        except ValidationError as exc: return _validation_response(exc)
        payload = _question_payload(question, [])
        audit_log(request, action="question.manual_created", resource_type="question", resource_id=question.id, after={"status": question.status, "banca": question.banca})
        return Response(payload, status=status.HTTP_201_CREATED)
    # A gestão exibe todo o acervo publicado; rascunhos e rejeitadas podem
    # incluir fontes importadas para fins de acompanhamento. As ações de edição
    # direta continuam restritas ao cadastro manual nos endpoints específicos.
    qs = Question.objects.select_related("exam", "source", "created_by", "search_run__started_by").order_by("-updated_at")
    return Response({"results": [_question_payload(q, []) for q in qs[:500]]})

@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def manual_question_detail(request, pk):
    question = Question.objects.filter(pk=pk, source__slug=MANUAL_SOURCE_SLUG).first()
    if not question: return Response({"detail": "Questão manual não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if question.status not in {Question.Status.DRAFT, Question.Status.REJECTED, Question.Status.APPROVED}: return Response({"detail": "A questão está na fila de revisão e não pode ser alterada aqui."}, status=status.HTTP_409_CONFLICT)
    before = {"status": question.status, "banca": question.banca, "statement": question.statement}
    try: _manual_question_write(question, request.data)
    except ValidationError as exc: return _validation_response(exc)
    audit_log(request, action="question.manual_updated", resource_type="question", resource_id=question.id, before=before, after={"status": question.status, "banca": question.banca, "statement": question.statement})
    return Response(_question_payload(question, []))

@api_view(["POST"])
@permission_classes([IsAdminUser])
def manual_question_publish(request, pk):
    question = Question.objects.filter(pk=pk, source__slug=MANUAL_SOURCE_SLUG).first()
    if not question: return Response({"detail": "Questão manual não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    try: _manual_question_validate({field: getattr(question, field) for field in ("statement", "banca", "discipline", "year", "options", "correct_answer", "source_url")}, question.pk)
    except ValidationError as exc: return _validation_response(exc)
    before = {"status": question.status}
    question.status = Question.Status.APPROVED; question.reviewed_by = request.user; question.reviewed_at = timezone.now(); question.rejection_reason = ""; question.rejection_reason_code = ""; question.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason", "rejection_reason_code", "updated_at"])
    audit_log(request, action="question.manual_published", resource_type="question", resource_id=question.id, before=before, after={"status": question.status})
    return Response(_question_payload(question, []))


@api_view(["POST"])
@permission_classes([IsAdminUser])
def manual_question_unpublish(request, pk):
    question = Question.objects.filter(pk=pk, source__slug=MANUAL_SOURCE_SLUG).first()
    if not question: return Response({"detail": "Questão manual não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if question.status != Question.Status.APPROVED: return Response({"detail": "Somente questões em produção podem ser retiradas."}, status=status.HTTP_409_CONFLICT)
    question.status = Question.Status.DRAFT; question.save(update_fields=["status", "updated_at"])
    audit_log(request, action="question.manual_unpublished", resource_type="question", resource_id=question.id, before={"status": Question.Status.APPROVED}, after={"status": question.status})
    return Response(_question_payload(question, []))


@api_view(["POST"])
@permission_classes([IsAdminUser])
def manual_question_submit(request, pk):
    question = Question.objects.filter(pk=pk, source__slug=MANUAL_SOURCE_SLUG).first()
    if not question: return Response({"detail": "Questão manual não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    if question.status not in {Question.Status.DRAFT, Question.Status.REJECTED}: return Response({"detail": "Esta questão já foi enviada para revisão."}, status=status.HTTP_409_CONFLICT)
    try: _manual_question_validate({field: getattr(question, field) for field in ("statement", "banca", "discipline", "year", "options", "correct_answer", "source_url")}, question.pk)
    except ValidationError as exc: return _validation_response(exc)
    question.status = Question.Status.PENDING; question.rejection_reason = ""; question.rejection_reason_code = ""; question.save(update_fields=["status", "rejection_reason", "rejection_reason_code", "updated_at"])
    audit_log(request, action="question.manual_submitted", resource_type="question", resource_id=question.id, before={"status": Question.Status.DRAFT}, after={"status": question.status})
    return Response(_question_payload(question, []))
