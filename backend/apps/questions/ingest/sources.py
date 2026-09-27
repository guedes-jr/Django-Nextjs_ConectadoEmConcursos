"""Adaptadores de fonte: cada um declara os filtros que sabe responder.

Uma execução é de **uma** fonte só, então não existe lista habilitada como em
`concursos.sources` — existe `get_adapter(slug)`. O adapter declara seus filtros
(`FilterSpec`), fornece as opções e devolve `QuestionItem`; o `pipeline` grava sem
saber de onde o item veio.
"""

import csv
import json
from pathlib import Path

import requests
from django.conf import settings
from django.core.exceptions import ValidationError

from apps.questions.naming import normalize_banca, normalize_discipline

from .base import FetchResult, FilterSpec, Option
from .parsers import parse_csv, parse_json, parse_xml, row_item

COMMON_FILTERS = [
    FilterSpec("banca", "Banca", "select", options_from="file", help_text="Escreva como a prova nomeia a banca."),
    FilterSpec("year_from", "Ano inicial", "int_range", options_from="file"),
    FilterSpec("year_to", "Ano final", "int_range", options_from="file"),
    FilterSpec("discipline", "Disciplina", "select", options_from="file"),
    FilterSpec("exam", "Prova", "select", options_from="file", help_text="As provas aparecem depois de escolher a banca."),
]

FILE_FILTER = FilterSpec("file", "Arquivo", "file", required=True, help_text="XML, JSON ou CSV com as questões.")


class AdapterNotConfigured(Exception):
    """A fonte existe no banco mas não tem URL/arquivo configurado no settings."""


class BaseAdapter:
    """Contrato que todo adapter de questões implementa."""

    kind = ""
    name = ""
    label = ""

    def __init__(self, source=None, config=None):
        self.source = source
        self.config = config or {}

    def filters(self) -> list[FilterSpec]:
        raise NotImplementedError

    def list_options(self, spec: FilterSpec, current: dict) -> list[Option]:
        return []

    def fetch_questions(self, filters: dict, limit: int, page: int) -> FetchResult:
        raise NotImplementedError

    def validate_filters(self, filters: dict) -> dict:
        """Descarta chave desconhecida e cobra o que é obrigatório."""
        known = {spec.key for spec in self.filters()}
        unknown = sorted(set(filters) - known)
        if unknown:
            raise ValidationError(
                {"filters": [f"Filtro não suportado por {self.label}: {', '.join(unknown)}."]}
            )
        cleaned = {key: value for key, value in filters.items() if value not in (None, "", [])}
        for spec in self.filters():
            if spec.required and not cleaned.get(spec.key):
                raise ValidationError({"filters": [f"{spec.label} é obrigatório."]})
        return cleaned

    def _items(self, rows, mapping: dict) -> list:
        items = []
        for number, row in enumerate(rows, 1):
            renamed = {mapping.get(key, key): value for key, value in row.items()}
            items.append(row_item(renamed, number))
        return items


class LocalFileAdapter(BaseAdapter):
    """Arquivo enviado pelo aluno ou deixado em disco."""

    kind = "local_file"
    label = "Arquivo local"

    def filters(self) -> list[FilterSpec]:
        return [*COMMON_FILTERS, FILE_FILTER]

    def resolve_path(self, filters: dict) -> Path:
        raw = (filters.get("file") or "").strip()
        if not raw:
            raise ValidationError({"filters": ["Informe o arquivo."]})
        path = Path(raw)
        if not path.is_absolute():
            path = Path(settings.MEDIA_ROOT) / "imports" / path.name
        if not path.is_file():
            raise ValidationError({"filters": [f"Arquivo não encontrado: {raw}"]})
        return path

    def list_options(self, spec: FilterSpec, current: dict) -> list[Option]:
        try:
            items = parse_file_items(self.resolve_path(current))
        except (ValidationError, ValueError):
            return []
        return _options_from_items(items, spec.key)

    def fetch_questions(self, filters: dict, limit: int, page: int) -> FetchResult:
        filters = self.validate_filters(filters)
        path = self.resolve_path(filters)
        items = parse_file_items(path)
        selected = apply_common_filters(items, filters)
        start = max(page - 1, 0) * limit
        window = selected[start : start + limit]
        return FetchResult(
            items=window,
            total=len(selected),
            next_page=page + 1 if start + limit < len(selected) else None,
            facets={"selected": len(selected), "total": len(items)},
        )


class OpenDatasetAdapter(BaseAdapter):
    """Dataset aberto em disco (CSV/JSON) com colunas renomeáveis."""

    kind = "open_dataset"
    label = "Dataset aberto"

    def filters(self) -> list[FilterSpec]:
        return list(COMMON_FILTERS) + [
            FilterSpec("role", "Cargo", "select", options_from="file"),
            FilterSpec("level", "Nível", "select", options_from="file"),
            FilterSpec("state", "UF", "text", options_from="file"),
            FilterSpec("q", "Texto livre", "text", help_text="Procura no enunciado."),
            FilterSpec("has_explanation", "Só com gabarito comentado", "bool"),
            FilterSpec("ordering", "Ordenação", "select", options_from="adapter"),
        ]

    def dataset_path(self) -> Path:
        raw = (self.config.get("path") or "").strip()
        if not raw:
            raise AdapterNotConfigured("Configure `path` da fonte em QUESTIONS_SOURCES.")
        path = Path(raw)
        if not path.is_file():
            raise AdapterNotConfigured(f"Dataset não encontrado: {raw}")
        return path

    def read_rows(self) -> list[dict]:
        path = self.dataset_path()
        if path.suffix.lower() == ".json":
            with path.open(encoding="utf-8-sig") as source:
                payload = json.load(source)
            rows = payload["questions"] if isinstance(payload, dict) else payload
            return list(rows)
        with path.open(encoding="utf-8-sig", newline="") as source:
            return list(csv.DictReader(source))

    def list_options(self, spec: FilterSpec, current: dict) -> list[Option]:
        try:
            items = self._items(self.read_rows(), self.config.get("mapping") or {})
        except (AdapterNotConfigured, ValueError, KeyError, TypeError):
            return []
        return _options_from_items(items, spec.key)

    def fetch_questions(self, filters: dict, limit: int, page: int) -> FetchResult:
        filters = self.validate_filters(filters)
        items = self._items(self.read_rows(), self.config.get("mapping") or {})
        selected = apply_common_filters(items, filters)
        text = (filters.get("q") or "").strip().lower()
        if text:
            selected = [item for item in selected if text in item.statement.lower()]
        if filters.get("has_explanation") in (True, "true", "1", "on"):
            selected = [item for item in selected if item.explanation.strip()]
        ordering = filters.get("ordering") or "year"
        selected.sort(key=lambda item: (item.year, item.number or 0), reverse=ordering == "newest")
        start = max(page - 1, 0) * limit
        return FetchResult(
            items=selected[start : start + limit],
            total=len(selected),
            next_page=page + 1 if start + limit < len(selected) else None,
        )


class PublicApiAdapter(BaseAdapter):
    """API pública: os filtros viram query params declarados no settings."""

    kind = "public_api"
    label = "API pública"

    def filters(self) -> list[FilterSpec]:
        specs = [
            FilterSpec("banca", "Banca", "select", param=self.config.get("banca_param", "banca"), options_from="facets"),
            FilterSpec("year_from", "Ano inicial", "int_range", param=self.config.get("year_param", "year_from"), options_from="facets"),
            FilterSpec("year_to", "Ano final", "int_range", param=self.config.get("year_param", "year_to"), options_from="facets"),
            FilterSpec("discipline", "Disciplina", "select", param=self.config.get("discipline_param", "discipline"), options_from="facets"),
            FilterSpec("exam", "Prova", "select", param=self.config.get("exam_param", "exam"), options_from="facets"),
            FilterSpec("q", "Texto livre", "text", param=self.config.get("query_param", "q"), options_from="facets"),
        ]
        if self.config.get("collection_url"):
            specs.append(FilterSpec("fetch_options", "Consultar opções agora", "bool"))
        return specs

    def url(self) -> str:
        url = (self.config.get("url") or "").strip()
        if not url:
            raise AdapterNotConfigured("Configure `url` da fonte em QUESTIONS_SOURCES.")
        return url

    def _get(self, url: str, params: dict) -> dict:
        try:
            response = requests.get(
                url,
                params=params,
                timeout=int(self.config.get("timeout", 25)),
                headers={"Accept": "application/json"},
            )
        except requests.RequestException as exc:
            raise AdapterNotConfigured(f"Falha ao consultar a API: {exc}") from exc
        if response.status_code >= 400:
            raise AdapterNotConfigured(f"A API respondeu {response.status_code}.")
        return response.json()

    def list_options(self, spec: FilterSpec, current: dict) -> list[Option]:
        if spec.options_from != "facets":
            return []
        cached = (self.source.cached_facets if self.source else {}) or {}
        options = cached.get(spec.key) or []
        return [Option(value=item["value"], label=item["label"], count=item.get("count")) for item in options]

    def fetch_questions(self, filters: dict, limit: int, page: int) -> FetchResult:
        filters = self.validate_filters(filters)
        params: dict = {}
        for spec in self.filters():
            value = filters.get(spec.key)
            if value in (None, "", False):
                continue
            if spec.key == "fetch_options":
                continue
            params[spec.param] = value
        params[self.config.get("limit_param", "limit")] = limit
        params[self.config.get("page_param", "page")] = page
        payload = self._get(self.url(), params)
        rows = payload.get("results", payload.get("data", payload)) if isinstance(payload, dict) else payload
        items = self._items(list(rows), self.config.get("mapping") or {})
        total = payload.get("total") if isinstance(payload, dict) else None
        facets = payload.get("facets") if isinstance(payload, dict) else None
        return FetchResult(
            items=items,
            total=total,
            next_page=page + 1 if total and page * limit < total else None,
            facets=facets or {},
        )


class OfficialIndexAdapter(BaseAdapter):
    """Índice oficial do órgão: a fonte é o índice, não o conteúdo.

    A fonte só entra na fila depois de `QuestionSource.license_name` e
    `home_url` — o índice aponta onde o texto legítimo está, e cada item precisa
    de `source_url` para a auditoria.
    """

    kind = "official_index"
    label = "Índice oficial"

    def filters(self) -> list[FilterSpec]:
        return [
            FilterSpec("banca", "Órgão", "select", param="orgao", options_from="file", required=True),
            FilterSpec("year", "Ano", "int_range", param="ano", options_from="file"),
            FilterSpec("exam", "Prova", "select", param="prova", options_from="file"),
            FilterSpec("q", "Texto livre", "text", param="busca", options_from="file"),
        ]

    def index_url(self) -> str:
        url = (self.config.get("url") or self.source.home_url or "").strip() if self.source else ""
        if not url:
            raise AdapterNotConfigured("Configure `url` (ou `home_url` na fonte) em QUESTIONS_SOURCES.")
        return url

    def list_options(self, spec: FilterSpec, current: dict) -> list[Option]:
        return []

    def fetch_questions(self, filters: dict, limit: int, page: int) -> FetchResult:
        filters = self.validate_filters(filters)
        fetch_url = (self.config.get("item_url") or "").strip()
        if not fetch_url:
            raise AdapterNotConfigured(
                "O índice oficial exige `item_url` configurado: ele aponta o documento "
                "de onde o conteúdo é lido, com {banca} e {exam} no template."
            )
        params = {key: value for key, value in filters.items() if key != "fetch_options"}
        try:
            response = requests.get(
                fetch_url.format(**params),
                params={"page": page, "limit": limit},
                timeout=int(self.config.get("timeout", 25)),
            )
        except requests.RequestException as exc:
            raise AdapterNotConfigured(f"Falha ao consultar o índice: {exc}") from exc
        if response.status_code >= 400:
            raise AdapterNotConfigured(f"O índice respondeu {response.status_code}.")
        payload = response.json()
        rows = payload.get("results", payload.get("data", payload)) if isinstance(payload, dict) else payload
        items = self._items(list(rows), self.config.get("mapping") or {})
        total = payload.get("total") if isinstance(payload, dict) else None
        next_page = payload.get("next_page") if isinstance(payload, dict) else None
        if next_page is None and total is not None and page * limit < total:
            next_page = page + 1
        return FetchResult(
            items=items,
            total=total,
            next_page=next_page,
            warnings=[] if all(item.source_url for item in items) else ["Itens sem `source_url`: a auditoria fica frágil."],
        )


ADAPTERS = {
    OpenDatasetAdapter.kind: OpenDatasetAdapter,
    PublicApiAdapter.kind: PublicApiAdapter,
    OfficialIndexAdapter.kind: OfficialIndexAdapter,
    LocalFileAdapter.kind: LocalFileAdapter,
}


def get_adapter(source) -> BaseAdapter:
    """Instancia o adapter do `QuestionSource` pelo seu `kind`."""
    kind = getattr(source, "kind", source)
    adapter_class = ADAPTERS.get(kind)
    if adapter_class is None:
        raise AdapterNotConfigured(f"Tipo de fonte desconhecido: {kind}")
    config = (getattr(settings, "QUESTIONS_SOURCES", {}) or {}).get(
        getattr(source, "slug", ""), {}
    )
    return adapter_class(source=source, config=config)


def parse_file_items(path: Path) -> list:
    parsers = {".xml": parse_xml, ".json": parse_json, ".csv": parse_csv}
    suffix = Path(path).suffix.lower()
    if suffix not in parsers:
        raise ValidationError({"filters": ["Formato aceito: .xml, .json ou .csv."]})
    return parsers[suffix](path)


def _options_from_items(items, key: str) -> list[Option]:
    """Opções de filtro a partir do próprio conteúdo do arquivo."""
    seen: dict[str, int] = {}
    for item in items:
        value = {
            "banca": item.banca,
            "discipline": item.discipline,
            "exam": item.exam_title,
            "role": item.role,
            "level": item.level,
        }.get(key, "")
        if not value:
            continue
        seen[value] = seen.get(value, 0) + 1
    return [Option(value=value, label=value, count=count) for value, count in sorted(seen.items())]


def apply_common_filters(items, filters: dict) -> list:
    """Aplica os filtros que qualquer fonte de arquivo entende."""
    selected = list(items)
    banca = (filters.get("banca") or "").strip()
    if banca:
        wanted = {normalize_banca(banca).lower()}
        selected = [item for item in selected if normalize_banca(item.banca).lower() in wanted]
    year_from = filters.get("year_from")
    year_to = filters.get("year_to")
    if year_from:
        selected = [item for item in selected if item.year >= int(year_from)]
    if year_to:
        selected = [item for item in selected if item.year <= int(year_to)]
    discipline = (filters.get("discipline") or "").strip()
    if discipline:
        wanted = {normalize_discipline(discipline).lower()}
        selected = [item for item in selected if normalize_discipline(item.discipline).lower() in wanted]
    exam = (filters.get("exam") or "").strip().lower()
    if exam:
        selected = [item for item in selected if item.exam_title.lower() == exam]
    return selected
