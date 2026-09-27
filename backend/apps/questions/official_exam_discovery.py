"""Descoberta controlada de documentos: apenas links do portal oficialmente cadastrado."""
import re
from html import unescape
from urllib.parse import urljoin, urlparse

import requests
from django.core.exceptions import ValidationError

from .models import OfficialExamDocument


def discover(portal):
    try:
        response = requests.get(portal.catalog_url, timeout=20, headers={"User-Agent": "ConectadoEmConcursos/1.0"})
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValidationError(f"Não foi possível consultar o portal oficial: {exc}") from exc
    if "text/html" not in response.headers.get("Content-Type", ""):
        raise ValidationError("O catálogo oficial não retornou uma página HTML para consulta.")
    links = re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', response.text, re.I | re.S)
    created = 0
    skipped = 0
    for href, label in links:
        url = urljoin(portal.catalog_url, unescape(href))
        host = urlparse(url).hostname or ""
        text = re.sub(r"<[^>]+>", " ", unescape(label)).strip()
        haystack = f"{text} {url}".lower()
        if host not in portal.allowed_hosts or ".pdf" not in haystack:
            continue
        if "gabarito" in haystack:
            kind = OfficialExamDocument.Kind.ANSWER_KEY_FINAL if "final" in haystack or "definit" in haystack else OfficialExamDocument.Kind.ANSWER_KEY_PRELIMINARY
        elif "prova" in haystack or "caderno" in haystack:
            kind = OfficialExamDocument.Kind.EXAM
        else:
            continue
        year_match = re.search(r"\b(20\d{2})\b", f"{text} {url}")
        _, was_created = OfficialExamDocument.objects.get_or_create(
            portal=portal, source_url=url,
            defaults={"title": text[:300] or "Documento oficial", "year": int(year_match.group(1)) if year_match else None, "kind": kind, "status": OfficialExamDocument.Status.REVIEW},
        )
        created += int(was_created)
        skipped += int(not was_created)
    return {"created": created, "skipped": skipped}
