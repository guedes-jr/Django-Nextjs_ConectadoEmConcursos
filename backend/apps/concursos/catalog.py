"""Representações de recursos publicados, sem expor arquivos privados do acervo."""
from django.db.models import Q
from .models import ConcursoResource


def resource_payload(item):
    return {"id": item.id, "title": item.title, "kind": item.kind, "kind_label": item.get_kind_display(),
            "has_file": bool(item.file), "file_name": item.file_name, "file_size": item.file_size,
            "description": item.description, "url": f"/api/concursos/{item.concurso_id}/resources/{item.pk}/file/" if item.file else item.url or (item.official_document.source_url if item.official_document_id else ""),
            "exam_id": item.exam_id, "exam_title": item.exam.title if item.exam_id else None}


def public_resources(concurso, exam_id=None):
    qs = ConcursoResource.objects.filter(concurso=concurso, is_published=True).filter(
        Q(exam__isnull=True) | Q(exam__is_published=True, exam__concurso=concurso)).select_related("exam", "official_document")
    if exam_id is not None:
        qs = qs.filter(Q(exam__isnull=True) | Q(exam_id=exam_id))
    return [resource_payload(item) for item in qs]
