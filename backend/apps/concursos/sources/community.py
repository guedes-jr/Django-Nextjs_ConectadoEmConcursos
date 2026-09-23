"""Adaptador genérico para APIs comunitárias de concursos (JSON).

As APIs da comunidade são instáveis e mudam de formato com frequência.
Este adaptador é intencionalmente tolerante: recebe um mapeamento de
campos na configuração, tenta extrair os valores e ignora erros de
parsing por item, nunca derrubando a sincronização completa.

Exemplo de configuração em settings:

    COMMUNITY_CONCURSOS_SOURCES = [
        {
            "name": "concursosnobrasil",
            "url": "https://api.exemplo.com/v1/concursos",
            "items_path": ["results"],
            "fields": {
                "title": "nome",
                "organization": "orgao",
                "status": "situacao",
                "state": "uf",
                "deadline": "data_inscricao",
                "source_url": "link",
            },
            "status_map": {
                "Inscrições Abertas": "open",
                "Autorizado": "expected",
                "Encerrado": "closed",
            },
        },
    ]
"""

import json
import re
from datetime import datetime, date

import requests

from .base import BaseAdapter, ConcursoItem
from .pci import USER_AGENT

_DATA_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")


def _deep_get(data, path: list[str]):
    current = data
    for key in path:
        if isinstance(current, dict) and key in current:
            current = current[key]
        elif isinstance(current, list) and isinstance(key, int) and key < len(current):
            current = current[key]
        else:
            return None
    return current


def _text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_date(value) -> date | None:
    if not value:
        return None
    raw = _text(value)
    match = _DATA_RE.search(raw)
    if match:
        day, month, year = match.groups()
        try:
            return datetime(int(year), int(month), int(day)).date()
        except ValueError:
            return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            continue
    return None


class CommunityJsonAdapter(BaseAdapter):
    """Lê uma API JSON e mapeia itens obedecendo `config`."""

    name = "community"
    label = "API comunitária"

    def __init__(self, config: dict, timeout: int = 25):
        self.config = config
        self.name = config.get("name", "community")
        self.label = config.get("label") or f"API {self.name}"
        self.url = config.get("url", "")
        self.timeout = config.get("timeout", timeout)
        self.headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    def fetch_json(self) -> list[dict]:
        if not self.url:
            return []
        try:
            response = requests.get(self.url, headers=self.headers, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, json.JSONDecodeError, ValueError):
            return []
        items_path = self.config.get("items_path") or []
        items = _deep_get(data, items_path)
        return items if isinstance(items, list) else []

    def fetch_concursos(self) -> list[ConcursoItem]:
        fields = self.config.get("fields") or {}
        status_map = self.config.get("status_map") or {}
        results: list[ConcursoItem] = []
        for raw in self.fetch_json():
            if not isinstance(raw, dict):
                continue

            def get(key):
                return _deep_get(raw, fields[key].split(".")) if fields.get(key) else None

            title = _text(get("title"))
            if not title:
                continue
            state = _text(get("state")) or get("uf") and _text(get("uf"))
            status_raw = _text(get("status"))
            status = status_map.get(status_raw, status_raw)
            if status not in ("open", "expected", "closed"):
                if "abr" in status_raw.lower() or "inscri" in status_raw.lower():
                    status = "open"
                elif "encerr" in status_raw.lower():
                    status = "closed"
                else:
                    status = "expected"
            deadline = _parse_date(get("deadline"))
            external_id = _text(get("external_id")) or _text(get("source_url")) or title
            results.append(ConcursoItem(
                external_id=external_id,
                title=title,
                source=self.name,
                organization=_text(get("organization")),
                headline=_text(get("headline")),
                body=_text(get("body")),
                roles=self.config.get("roles") or [],
                levels=[],
                state=state.upper()[:2],
                status=status,
                deadline=deadline,
                source_url=_text(get("source_url")),
                published_at=None,
            ))
        return results