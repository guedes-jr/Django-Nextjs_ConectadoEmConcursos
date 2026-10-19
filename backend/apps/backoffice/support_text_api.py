"""Cadastro editorial de textos compartilhados, sem alterar publicação de questões."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils.html import strip_tags
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.questions.models import Question, SupportText
from .audit import log as audit_log
from .permissions import EditorialAccess, has_role


def _version_matches(data, updated_at):
    try:
        return parse_datetime(str(data.get("updated_at", ""))) == updated_at
    except ValueError:
        return False


def support_text_payload(text):
    return {"id": text.id, "title": text.title, "content": text.content, "reference": text.reference,
            "updated_at": text.updated_at.isoformat(), "question_count": text.question_count if hasattr(text, "question_count") else text.questions.count()}


class SupportTextWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportText
        fields = ["title", "content", "reference"]

    def validate_content(self, value):
        if not strip_tags(value).replace("&nbsp;", " ").strip():
            raise serializers.ValidationError("Informe o conteúdo do texto.")
        return value


def validate_support_text_id(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not SupportText.objects.filter(pk=value).exists():
        raise ValidationError({"support_text_id": ["Selecione um texto de apoio válido."]})
    return value


@api_view(["GET", "POST"])
@permission_classes([EditorialAccess])
def support_texts(request):
    if request.method == "POST":
        serializer = SupportTextWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        text = serializer.save()
        audit_log(request, action="support_text.created", resource_type="support_text", resource_id=text.id,
                  after=support_text_payload(text))
        return Response(support_text_payload(text), status=201)
    qs = SupportText.objects.annotate(question_count=Count("questions"))
    search = request.query_params.get("search", "").strip()
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(content__icontains=search) | Q(reference__icontains=search))
    if request.query_params.get("usage") == "linked":
        qs = qs.filter(question_count__gt=0)
    elif request.query_params.get("usage") == "unused":
        qs = qs.filter(question_count=0)
    try:
        page = max(1, int(request.query_params.get("page", 1)))
        size = max(1, min(100, int(request.query_params.get("page_size", 12))))
    except (ValueError, TypeError):
        return Response({"detail": "Paginação inválida."}, status=400)
    count = qs.count()
    page = min(page, max(1, (count + size - 1) // size))
    overview = {"total": SupportText.objects.count(), "linked": SupportText.objects.filter(questions__isnull=False).distinct().count(),
                "questions": Question.objects.filter(support_text__isnull=False).count()}
    return Response({"results": [support_text_payload(x) for x in qs[(page-1)*size:page*size]],
                     "count": count, "page": page, "overview": overview,
                     "permissions": {"can_edit": has_role(request.user, "admin", "editor")}})


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([EditorialAccess])
@transaction.atomic
def support_text_detail(request, pk):
    text = get_object_or_404(SupportText.objects.select_for_update(), pk=pk)
    if request.method == "GET":
        return Response(support_text_payload(text))
    if not _version_matches(request.data, text.updated_at):
        return Response({"detail": "O texto foi alterado. Recarregue antes de continuar."}, status=409)
    before = support_text_payload(text)
    if request.method == "DELETE":
        try:
            text.delete()
        except ProtectedError:
            return Response({"detail": "Este texto possui questões vinculadas. Remova os vínculos antes de excluir."}, status=409)
        audit_log(request, action="support_text.deleted", resource_type="support_text", resource_id=pk, before=before)
        return Response(status=204)
    serializer = SupportTextWriteSerializer(text, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    text = serializer.save()
    audit_log(request, action="support_text.updated", resource_type="support_text", resource_id=pk,
              before=before, after=support_text_payload(text))
    return Response(support_text_payload(text))


@api_view(["PATCH"])
@permission_classes([EditorialAccess])
@transaction.atomic
def question_support_text(request, pk):
    question = get_object_or_404(Question.objects.select_for_update(), pk=pk)
    if not _version_matches(request.data, question.updated_at):
        return Response({"detail": "A questão foi alterada. Recarregue antes de salvar."}, status=409)
    if "support_text_id" not in request.data:
        return Response({"detail": "Informe o texto ou null para remover o vínculo."}, status=400)
    try:
        value = validate_support_text_id(request.data["support_text_id"])
    except ValidationError as exc:
        return Response(exc.message_dict, status=400)
    before = question.support_text_id
    question.support_text_id = value
    question.save(update_fields=["support_text", "updated_at"])
    audit_log(request, action="question.support_text_changed", resource_type="question", resource_id=pk,
              before={"support_text_id": before}, after={"support_text_id": value})
    return Response({"id": pk, "support_text_id": value, "updated_at": question.updated_at.isoformat()})
