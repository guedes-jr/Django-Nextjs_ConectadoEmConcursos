import hashlib
from datetime import timedelta
from tempfile import SpooledTemporaryFile
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.files import File
from django.db import transaction
from django.utils import timezone

from .models import OfficialExamDocument, OfficialExamDownload

MAX_BYTES = 100 * 1024 * 1024
CHUNK_SIZE = 64 * 1024
PDF_MIME_TYPES = {"application/pdf", "application/x-pdf"}


def _allowed_host(host, allowed_hosts):
    return bool(host) and host.lower() in {item.lower() for item in allowed_hosts}


def create_download(document, user):
    """Cria uma tentativa pendente; a transferência será executada pelo worker."""
    with transaction.atomic():
        document = OfficialExamDocument.objects.select_for_update().get(pk=document.pk)
        if OfficialExamDownload.objects.filter(document=document, status=OfficialExamDownload.Status.RUNNING).exists():
            raise ValueError("Já existe um download em andamento para este documento.")
        limit = int(getattr(settings, "OFFICIAL_EXAM_DOWNLOAD_LIMIT", 10))
        window_seconds = int(getattr(settings, "OFFICIAL_EXAM_DOWNLOAD_WINDOW_SECONDS", 3600))
        if limit > 0 and OfficialExamDownload.objects.filter(
            document__portal_id=document.portal_id,
            created_at__gte=timezone.now() - timedelta(seconds=max(1, window_seconds)),
        ).count() >= limit:
            raise ValueError("Limite de downloads deste portal atingido. Aguarde antes de tentar novamente.")
        return OfficialExamDownload.objects.create(document=document, started_by=user)


def run(download_id):
    """Tarefa django-q: realiza um download que já possui trilha de auditoria."""
    record = OfficialExamDownload.objects.select_related("document__portal").filter(pk=download_id).first()
    if not record or record.status != OfficialExamDownload.Status.RUNNING:
        return None
    document = record.document
    try:
        response = requests.get(document.source_url, timeout=(10, 60), allow_redirects=True, stream=True)
        record.http_status = response.status_code
        record.final_url = response.url
        final_host = urlparse(response.url).hostname
        if not _allowed_host(final_host, document.portal.allowed_hosts):
            raise ValueError("O redirecionamento saiu dos domínios oficiais permitidos.")
        if response.status_code >= 400:
            raise ValueError(f"A origem respondeu HTTP {response.status_code}.")
        content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type not in PDF_MIME_TYPES:
            raise ValueError("A origem não retornou um PDF (Content-Type inválido).")
        declared_size = response.headers.get("Content-Length")
        if declared_size and int(declared_size) > MAX_BYTES:
            raise ValueError("PDF excede o limite de 100 MB.")

        total, digest, first_bytes = 0, hashlib.sha256(), b""
        with SpooledTemporaryFile(max_size=2 * 1024 * 1024, mode="w+b") as temporary:
            for chunk in response.iter_content(CHUNK_SIZE):
                if not chunk:
                    continue
                if len(first_bytes) < 5:
                    first_bytes += chunk[: 5 - len(first_bytes)]
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError("PDF excede o limite de 100 MB.")
                digest.update(chunk)
                temporary.write(chunk)
            if not total:
                raise ValueError("PDF vazio.")
            if first_bytes != b"%PDF-":
                raise ValueError("O arquivo recebido não possui assinatura PDF válida.")
            temporary.seek(0)
            record.file.save(f"documento-{document.id}.pdf", File(temporary), save=False)
        record.bytes_count = total
        record.sha256 = digest.hexdigest()
        record.status = OfficialExamDownload.Status.DONE
        document.status = OfficialExamDocument.Status.DOWNLOADED
        document.save(update_fields=["status", "updated_at"])
    except (requests.RequestException, ValueError, OSError) as exc:
        record.status = OfficialExamDownload.Status.FAILED
        record.error_message = str(exc)[:300]
    except Exception as exc:
        record.status = OfficialExamDownload.Status.FAILED
        record.error_message = f"Falha inesperada no download: {exc}"[:300]
    finally:
        record.finished_at = timezone.now()
        record.save()
    return record.id
