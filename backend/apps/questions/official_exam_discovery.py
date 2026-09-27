"""Descoberta controlada de documentos em catálogos oficiais."""
import re
from html import unescape
from urllib.parse import urljoin, urlparse

import requests
from django.core.exceptions import ValidationError

from .models import OfficialExamDocument

CNU_ORGANIZATION = "Ministério da Gestão e da Inovação"
PF_ORGANIZATION = "Polícia Federal"
INEP_ORGANIZATION = "INEP"


def _clean_text(value):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", unescape(value))).strip()


def _kind_for(portal, haystack):
    if "gabarito" in haystack:
        return OfficialExamDocument.Kind.ANSWER_KEY_FINAL if "final" in haystack or "definit" in haystack else OfficialExamDocument.Kind.ANSWER_KEY_PRELIMINARY
    exam_terms = ("prova", "caderno")
    if portal.slug == "cnu":
        exam_terms += ("bloco", "concurso nacional unificado")
    return OfficialExamDocument.Kind.EXAM if any(term in haystack for term in exam_terms) else None


def _cnu_metadata(text, url):
    role_match = re.search(r"bloco(?:\s+tem[aá]tico)?\s*(\d+)", f"{text} {url}", re.I)
    role = f"Bloco temático {role_match.group(1)}" if role_match else ""
    title = text if text.lower().startswith("cnu") else f"CNU — {text}"
    return {"title": title[:300], "organization": CNU_ORGANIZATION, "role": role}


def _pf_metadata(text, url):
    role_match = re.search(r"cargo\s+de\s+([^|;–—]+)", text, re.I)
    role = role_match.group(1).strip(" .:-")[:180] if role_match else ""
    title = text if text.lower().startswith("polícia federal") else f"Polícia Federal — {text}"
    return {"title": title[:300], "organization": PF_ORGANIZATION, "role": role}


def _enem_metadata(text, url):
    day_match = re.search(r"dia\s*([12])", f"{text} {url}", re.I)
    role = f"Dia {day_match.group(1)}" if day_match else ""
    title = text if text.lower().startswith("enem") else f"ENEM — {text}"
    return {"title": title[:300], "organization": INEP_ORGANIZATION, "role": role}


def _enade_metadata(text, url):
    course_match = re.search(r"(?:curso|[áa]rea)\s*:\s*([^|;–—]+)", text, re.I)
    role = course_match.group(1).strip(" .:-")[:180] if course_match else ""
    title = text if text.lower().startswith("enade") else f"ENADE — {text}"
    return {"title": title[:300], "organization": INEP_ORGANIZATION, "role": role}


def _candidate(portal, href, label):
    url = urljoin(portal.catalog_url, unescape(href))
    host = (urlparse(url).hostname or "").lower()
    allowed_hosts = {item.lower() for item in portal.allowed_hosts}
    text = _clean_text(label)
    haystack = f"{text} {url}".lower()
    if host not in allowed_hosts or ".pdf" not in haystack:
        return None
    kind = _kind_for(portal, haystack)
    if not kind:
        return None
    year_match = re.search(r"\b(20\d{2})\b", f"{text} {url}")
    metadata = _cnu_metadata(text, url) if portal.slug == "cnu" else _pf_metadata(text, url) if portal.slug == "pf" else _enem_metadata(text, url) if portal.slug == "enem" else _enade_metadata(text, url) if portal.slug == "enade" else {"title": text[:300] or "Documento oficial", "organization": "", "role": ""}
    return {
        **metadata,
        "source_url": url,
        "year": int(year_match.group(1)) if year_match else None,
        "kind": kind,
        "already_registered": OfficialExamDocument.objects.filter(portal=portal, source_url=url).exists(),
    }


def discover(portal, persist=False):
    try:
        response = requests.get(portal.catalog_url, timeout=20, headers={"User-Agent": "ConectadoEmConcursos/1.0"})
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValidationError(f"Não foi possível consultar o portal oficial: {exc}") from exc
    if "text/html" not in response.headers.get("Content-Type", "").lower():
        raise ValidationError("O catálogo oficial não retornou uma página HTML para consulta.")

    links = re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', response.text, re.I | re.S)
    seen, candidates = set(), []
    for href, label in links:
        candidate = _candidate(portal, href, label)
        if candidate and candidate["source_url"] not in seen:
            seen.add(candidate["source_url"])
            candidates.append(candidate)

    created = skipped = 0
    if persist:
        for candidate in candidates:
            _, was_created = OfficialExamDocument.objects.get_or_create(
                portal=portal,
                source_url=candidate["source_url"],
                defaults={"title": candidate["title"], "year": candidate["year"], "organization": candidate["organization"], "role": candidate["role"], "kind": candidate["kind"], "status": OfficialExamDocument.Status.REVIEW},
            )
            created += int(was_created)
            skipped += int(not was_created)
    return {"created": created, "skipped": skipped, "candidates": candidates}
