"""Estruturas normalizadas e contrato base para os adaptadores de fontes.

Cada adaptador do pacote `apps.concursos.sources` converte os dados da
fonte externa em itens destes dataclasses. O comando `sync_sources` então
grava esses itens no banco de forma idempotente (upsert por source+external_id).
"""

from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class ConcursoItem:
    external_id: str
    title: str
    source: str = "base"
    organization: str = ""
    body: str = ""
    headline: str = ""
    roles: list[str] = field(default_factory=list)
    levels: list[str] = field(default_factory=list)
    state: str = ""
    region: str = ""
    status: str = "open"
    deadline: date | None = None
    source_url: str = ""
    vacancies: int | None = None
    max_salary: int | None = None
    published_at: datetime | None = None


@dataclass
class NewsItem:
    external_id: str
    title: str
    source: str = "base"
    summary: str = ""
    body: str = ""
    category: str = ""
    image_url: str = ""
    source_url: str = ""
    published_at: datetime | None = None


class BaseAdapter:
    """Contrato que os adaptadores de fonte devem implementar."""

    name = "base"
    label = "Fonte base"

    def fetch_concursos(self) -> list[ConcursoItem]:
        return []

    def fetch_news(self) -> list[NewsItem]:
        return []