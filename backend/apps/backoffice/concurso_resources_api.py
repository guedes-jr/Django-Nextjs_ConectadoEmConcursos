import logging
from contextlib import ExitStack
from functools import wraps
from django.conf import settings
from .backup_storage import operation_lock
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response

from apps.concursos.models import Concurso, ConcursoResource
from apps.concursos.catalog import resource_payload
from apps.concursos.files import validate_pdf
from .permissions import EditorialAccess, has_role
from .audit import log as audit_log


class ResourceSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False)
    remove_file = serializers.BooleanField(write_only=True, required=False, default=False)

    def validate_file(self, value):
        self.upload_metadata = validate_pdf(value)
        return value

    def update(self, instance, validated_data):
        remove = validated_data.pop("remove_file", False)
        if validated_data.get("file"):
            validated_data.update(self.upload_metadata)
        elif remove:
            validated_data.update(file="", file_name="", file_size=0, file_sha256="")
        return super().update(instance, validated_data)

    class Meta:
        model = ConcursoResource
        fields = ["title", "kind", "description", "url", "exam", "official_document", "is_published", "file", "remove_file"]

    def validate_url(self, value):
        if value and not value.lower().startswith(("http://", "https://")):
            raise serializers.ValidationError("Use uma URL HTTP(S).")
        return value

    def validate(self, attrs):
        exam = attrs.get("exam", self.instance.exam if self.instance else None)
        document = attrs.get("official_document", self.instance.official_document if self.instance else None)
        url = attrs.get("url", self.instance.url if self.instance else "")
        if exam and exam.concurso_id != self.context["concurso"].pk:
            raise serializers.ValidationError({"exam": "Escolha uma prova deste concurso."})
        uploaded = bool(attrs.get("file")) or bool(self.instance and self.instance.file and not attrs.get("remove_file"))
        if sum([bool(url), bool(document), uploaded]) != 1:
            raise serializers.ValidationError({"url": "Escolha uma única origem: link, documento do acervo ou PDF enviado."})
        kind = attrs.get("kind", self.instance.kind if self.instance else None)
        if document and not document.source_url.lower().startswith(("https://", "http://")):
            raise serializers.ValidationError({"official_document": "O documento precisa ter um link HTTP(S) de origem."})
        if document and document.kind != kind:
            raise serializers.ValidationError({"official_document": "O tipo do documento não corresponde ao material selecionado."})
        if attrs.get("is_published", self.instance.is_published if self.instance else False) and exam and not exam.is_published:
            raise serializers.ValidationError({"exam": "Publique a prova antes de disponibilizar seu material."})
        return attrs


def admin_payload(item):
    return {**resource_payload(item), "is_published": item.is_published, "exam": item.exam_id,
            "official_document": item.official_document_id, "url": item.url, "file_sha256": item.file_sha256, "updated_at": item.updated_at.isoformat()}


def _delete_file(storage, name):
    try:
        storage.delete(name)
    except OSError:
        logging.getLogger(__name__).exception("Falha ao limpar PDF antigo; verificar armazenamento privado.")


def _save_resource(serializer, item, request, action, before=None):
    old = item.file.name
    serializer.instance = item
    try:
        with transaction.atomic():
            item = serializer.save()
            audit_log(request, action=action, resource_type="concurso_resource", resource_id=item.pk,
                      before=before, after=admin_payload(item))
            if old and old != item.file.name:
                transaction.on_commit(lambda: _delete_file(item.file.storage, old))
    except Exception:
        if item.file.name and item.file.name != old and item.file._committed:
            _delete_file(item.file.storage, item.file.name)
        raise
    return item


def resource_write(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if request.method == "GET":
            return view(request, *args, **kwargs)
        with ExitStack() as stack:
            try:
                stack.enter_context(operation_lock(settings.BACKUP_DIR))
            except ValueError:
                return Response({"detail": "Backup/restauração em andamento. Tente salvar novamente."}, status=503, headers={"Retry-After": "5"})
            # Commit and file cleanup finish before a backup can take its snapshot.
            with transaction.atomic():
                return view(request, *args, **kwargs)
    return wrapped


@api_view(["GET", "POST"])
@permission_classes([EditorialAccess])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@resource_write
def resources(request, pk):
    concurso = get_object_or_404(Concurso, pk=pk)
    if request.method == "GET":
        return Response({"results": [admin_payload(x) for x in concurso.resources.select_related("exam", "official_document")],
                         "can_manage": has_role(request.user, "admin", "editor")})
    serializer = ResourceSerializer(data=request.data, context={"concurso": concurso})
    serializer.is_valid(raise_exception=True)
    item = _save_resource(serializer, ConcursoResource(concurso=concurso), request, "concurso.resource_created")
    return Response(admin_payload(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([EditorialAccess])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@resource_write
def resource_detail(request, pk, resource_id):
    item = get_object_or_404(ConcursoResource.objects.select_for_update().select_related("concurso"), pk=resource_id, concurso_id=pk)
    try:
        matches = parse_datetime(str(request.data.get("updated_at", ""))) == item.updated_at
    except ValueError:
        matches = False
    if not matches:
        return Response({"detail": "O material foi alterado. Recarregue antes de continuar."}, status=409)
    before = admin_payload(item)
    if request.method == "DELETE":
        old = item.file.name
        item.delete()
        if old:
            transaction.on_commit(lambda: _delete_file(item.file.storage, old))
        audit_log(request, action="concurso.resource_deleted", resource_type="concurso_resource", resource_id=resource_id, before=before)
        return Response(status=204)
    serializer = ResourceSerializer(item, data=request.data, partial=True, context={"concurso": item.concurso})
    serializer.is_valid(raise_exception=True)
    item = _save_resource(serializer, item, request, "concurso.resource_updated", before)
    return Response(admin_payload(item))
