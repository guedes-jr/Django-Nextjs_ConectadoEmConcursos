"""PDFs enviados pela equipe: nomes opacos e armazenamento sem URL pública."""
import hashlib
import os
from pathlib import Path
from uuid import uuid4
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils import timezone
from django.utils.text import get_valid_filename
from rest_framework import serializers

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class PrivateConcursoStorage(FileSystemStorage):
    def __init__(self):
        super().__init__(file_permissions_mode=0o600, directory_permissions_mode=0o700)

    @property
    def base_location(self):
        return str(settings.OFFICIAL_EXAMS_ROOT)

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def _save(self, name, content):
        try:
            return super()._save(name, content)
        except Exception:
            try:
                self.delete(name)
            except OSError:
                pass
            raise

    def url(self, name):
        raise ValueError("Materiais enviados não possuem URL pública de armazenamento.")


concurso_file_storage = PrivateConcursoStorage()


def resource_upload_path(instance, filename):
    return f"concurso-materials/{timezone.now():%Y/%m}/{uuid4().hex}.pdf"


def validate_pdf(upload):
    if Path(upload.name).suffix.lower() != ".pdf":
        raise serializers.ValidationError("Envie um arquivo PDF.")
    if upload.size > MAX_UPLOAD_BYTES:
        raise serializers.ValidationError("O PDF deve ter no máximo 25 MB.")
    if upload.content_type not in {"application/pdf", "application/x-pdf", "application/octet-stream"}:
        raise serializers.ValidationError("O tipo do arquivo não corresponde a um PDF.")
    digest, total, head, tail = hashlib.sha256(), 0, b"", b""
    for chunk in upload.chunks():
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("O PDF deve ter no máximo 25 MB.")
        if len(head) < 5:
            head += chunk[:5-len(head)]
        tail = (tail + chunk)[-2048:]
        digest.update(chunk)
    upload.seek(0)
    if not total or head != b"%PDF-" or b"%%EOF" not in tail:
        raise serializers.ValidationError("O arquivo não possui uma assinatura PDF válida ou está incompleto.")
    name = get_valid_filename(upload.name.replace("\\", "/").rsplit("/", 1)[-1])
    return {"file_name": name[:196] + ".pdf" if len(name) > 200 else name,
            "file_size": total, "file_sha256": digest.hexdigest()}
