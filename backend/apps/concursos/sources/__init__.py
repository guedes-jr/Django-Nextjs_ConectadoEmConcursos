"""Registros e fábrica de adaptadores de fontes de dados.

O comando `sync_sources` instancia os adaptadores via `build_adapters()`.
As fontes ativas vêm de `settings.CONCURSOS_SOURCES` (lista separada por
vírgula) — valores possíveis: `pci`, `google-news`, `rss`, `community`.
"""

from django.conf import settings

from .base import BaseAdapter, ConcursoItem, NewsItem
from .community import CommunityJsonAdapter
from .pci import PciAdapter
from .rss import GoogleNewsAdapter, RssNewsAdapter

__all__ = [
    "BaseAdapter",
    "ConcursoItem",
    "NewsItem",
    "PciAdapter",
    "RssNewsAdapter",
    "GoogleNewsAdapter",
    "CommunityJsonAdapter",
    "build_adapters",
]


def build_adapters(enabled: list[str] | None = None) -> list[BaseAdapter]:
    """Instancia os adaptadores ativos conforme as configurações do projeto."""
    settings_cfg = getattr(settings, "CONCURSOS", {})
    sources = getattr(settings, "CONCURSOS_SOURCES", "pci,google-news")
    allowed = [name.strip().lower() for name in sources.split(",") if name.strip()]
    if enabled:
        requested = [name.strip().lower() for name in enabled]
        allowed = [name for name in allowed if name in requested]

    timeout = int(settings_cfg.get("timeout", 25))
    adapters: list[BaseAdapter] = []

    if "pci" in allowed:
        pci_cfg = settings_cfg.get("pci", {})
        adapters.append(PciAdapter(
            url=pci_cfg.get("url", "https://www.pciconcursos.com.br/concursos/"),
            timeout=int(pci_cfg.get("timeout", timeout)),
            delay=float(pci_cfg.get("delay", 0)),
        ))

    if "google-news" in allowed:
        gn_cfg = settings_cfg.get("google_news", {})
        adapters.append(GoogleNewsAdapter(
            query=gn_cfg.get("query", "concurso público"),
            category=gn_cfg.get("category", "Destaques"),
            limit=int(gn_cfg.get("limit", 25)),
            timeout=int(gn_cfg.get("timeout", timeout)),
        ))

    if "rss" in allowed:
        for feed in settings_cfg.get("rss_feeds", []):
            adapters.append(RssNewsAdapter(
                feed_url=feed.get("url", ""),
                category=feed.get("category", ""),
                title_filter=feed.get("filter", ""),
                timeout=int(feed.get("timeout", timeout)),
            ))

    if "community" in allowed:
        for config in settings_cfg.get("community", []):
            if config.get("url"):
                adapters.append(CommunityJsonAdapter(config, timeout=timeout))

    return adapters