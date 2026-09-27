"""API administrativa para fontes, buscas e fila de questões."""

import json

from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.questions import moderation
from apps.questions.ingest import run as run_search
from apps.questions.ingest.duplicates import DuplicateChecker, content_hash
from apps.questions.ingest.sources import AdapterNotConfigured, get_adapter
from apps.questions.models import OfficialExamDocument, OfficialExamPortal, Question, QuestionSource, SearchRun
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
        "external_id": question.external_id,
        "content_hash": question.content_hash
        or content_hash(question.statement, question.options),
        "source_url": question.source_url,
        "source": _source_payload(source) if source else None,
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
        return Response(_run_payload(run), status=status.HTTP_201_CREATED)

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
    return Response(_run_payload(run), status=status.HTTP_201_CREATED)


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
        changed.append(_question_payload(question, []))
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


def _document_payload(document):
    return {"id": document.id, "portal": document.portal.slug, "portal_name": document.portal.name, "title": document.title, "year": document.year, "organization": document.organization, "role": document.role, "kind": document.kind, "status": document.status, "source_url": document.source_url, "paired_with": document.paired_with_id, "created_at": document.created_at}


@api_view(["GET"])
@permission_classes([IsAdminUser])
def official_exam_portals(request):
    portals = OfficialExamPortal.objects.annotate(documents_count=Count("documents")).order_by("name")
    return Response({"results": [_portal_payload(portal) for portal in portals]})


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
    return Response({"results": [_document_payload(document) for document in documents[:200]]})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def official_exam_discover(request, slug):
    portal = OfficialExamPortal.objects.filter(slug=slug, is_active=True).first()
    if not portal:
        return Response({"detail": "Portal oficial não encontrado ou inativo."}, status=status.HTTP_404_NOT_FOUND)
    from apps.questions.official_exam_discovery import discover
    try:
        result = discover(portal)
    except ValidationError as exc:
        return _validation_response(exc)
    return Response({"detail": f"Consulta concluída: {result['created']} referência(s) nova(s), {result['skipped']} já existente(s).", **result})
