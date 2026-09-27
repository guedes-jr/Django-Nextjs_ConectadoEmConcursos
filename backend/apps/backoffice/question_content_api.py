"""API administrativa para fontes, buscas e fila de questões."""

import json

from django.core.exceptions import ValidationError
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.questions import moderation
from apps.questions.ingest import run as run_search
from apps.questions.ingest.sources import AdapterNotConfigured, get_adapter
from apps.questions.models import Question, QuestionSource, SearchRun


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
        "last_sync_at": source.last_sync_at,
        "facets_at": source.facets_at,
    }


def _run_payload(run):
    return {
        "id": run.id,
        "name": run.name,
        "source": run.source.slug,
        "filters": run.filters,
        "fingerprint": run.fingerprint,
        "status": run.status,
        "next_page": run.next_page,
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


def _question_payload(question):
    source = question.source
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
        "content_hash": question.content_hash,
        "source_url": question.source_url,
        "source": _source_payload(source) if source else None,
        "review_note": question.review_note,
        "rejection_reason": question.rejection_reason,
        "rejection_reason_code": question.rejection_reason_code,
        "reviewed_by": question.reviewed_by.username if question.reviewed_by else None,
        "reviewed_at": question.reviewed_at,
    }


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
    return Response(payload)


def _resume_run(request, pk, page):
    parent = SearchRun.objects.select_related("source").filter(pk=pk).first()
    if not parent:
        return Response({"detail": "Busca não encontrada."}, status=status.HTTP_404_NOT_FOUND)
    try:
        run = run_search(parent.source, parent.filters, limit=_number(request.data.get("limit"), 200, 1000), page=page, started_by=request.user, parent=parent, dry_run=bool(request.data.get("dry_run", False)))
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


@api_view(["GET"])
@permission_classes([IsAdminUser])
def questions_queue(request):
    queryset = Question.objects.select_related("source", "exam", "reviewed_by", "search_run").order_by("id")
    status_filter = request.query_params.get("status", Question.Status.PENDING)
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if source := request.query_params.get("source"):
        queryset = queryset.filter(source__slug=source)
    if search_run := request.query_params.get("search_run"):
        queryset = queryset.filter(search_run_id=search_run)
    if banca := request.query_params.get("banca"):
        queryset = queryset.filter(banca__iexact=banca)
    if discipline := request.query_params.get("discipline"):
        queryset = queryset.filter(discipline__iexact=discipline)
    if year := request.query_params.get("year"):
        queryset = queryset.filter(year=year)
    if search := request.query_params.get("search"):
        queryset = queryset.filter(Q(statement__icontains=search) | Q(explanation__icontains=search))
    limit, offset = _number(request.query_params.get("limit")), _offset(request.query_params.get("offset"))
    total = queryset.count()
    return Response({"total": total, "limit": limit, "offset": offset, "results": [_question_payload(question) for question in queryset[offset:offset + limit]]})


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
    return Response({"cursor": question.id, "question": _question_payload(question)})


def _question_ids(data):
    ids = data.get("ids", data.get("id"))
    if isinstance(ids, int):
        return [ids]
    if isinstance(ids, list) and ids and all(isinstance(item, int) for item in ids):
        return ids
    return []


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
            return Response({"detail": f"A questão #{question.id} não está pendente."}, status=status.HTTP_409_CONFLICT)
        try:
            if action == "approve":
                moderation.approve(question, request.user, request.data.get("explanation"))
            else:
                moderation.reject(question, request.user, request.data.get("reason"), request.data.get("reason_code"))
        except ValidationError as exc:
            return _validation_response(exc)
        changed.append(_question_payload(question))
    return Response({"results": changed})


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
            limit=_number(request.data.get("limit"), 200, 1000),
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
