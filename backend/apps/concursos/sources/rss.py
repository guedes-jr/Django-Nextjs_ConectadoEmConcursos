"""Adaptador RSS genérico para notícias.

Lê qualquer feed RSS 2.0 / Atom e transforma os itens em NewsItem
normalizados. Usado por padrão com o feed público do Google Notícias,
que não exige chave e é estável (mesmo endpoint usado pelo Google).
"""

import html
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

import requests

from .base import BaseAdapter, NewsItem
from .pci import USER_AGENT

_MEDIA_NS = "http://search.yahoo.com/mrss/"
_ATOM_NS = "http://www.w3.org/2005/Atom"


def parse_rfc_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _text(element: ET.Element | None) -> str:
    if element is None or not element.text:
        return ""
    return html.unescape(element.text).strip()


def _read_rss(xml_text: str) -> list[NewsItem]:
    root = ET.fromstring(xml_text)
    items: list[NewsItem] = []
    for entry in root.iter("item"):
        title = _text(entry.find("title"))
        if not title:
            continue
        link = _text(entry.find("link"))
        description = _text(entry.find("description"))
        summary = re.sub(r"<[^>]+>", "", description)
        summary = html.unescape(summary).strip()
        if len(summary) > 600:
            summary = summary[:597] + "…"
        published = parse_rfc_datetime(_text(entry.find("pubDate")))
        category = _text(entry.find("category"))
        image_url = ""
        media = entry.find(f"{{{_MEDIA_NS}}}content")
        if media is not None and media.get("url"):
            image_url = media.get("url")
        else:
            media_thumb = entry.find(f"{{{_MEDIA_NS}}}thumbnail")
            if media_thumb is not None and media_thumb.get("url"):
                image_url = media_thumb.get("url")
        items.append(NewsItem(
            external_id=link or f"rss:{title}:{published:%Y%m%d%H%M%S}" if published else f"rss:{title}",
            title=title,
            summary=summary,
            category=category,
            image_url=image_url,
            source_url=link,
            published_at=published,
        ))
    return items


def _read_atom(xml_text: str) -> list[NewsItem]:
    root = ET.fromstring(xml_text)
    items: list[NewsItem] = []
    for entry in root.iter(f"{{{_ATOM_NS}}}entry"):
        title = _text(entry.find(f"{{{_ATOM_NS}}}title"))
        if not title:
            continue
        link_el = entry.find(f"{{{_ATOM_NS}}}link")
        link = link_el.get("href") if link_el is not None else ""
        published = parse_rfc_datetime(_text(entry.find(f"{{{_ATOM_NS}}}published")))
        if not published:
            published = parse_rfc_datetime(_text(entry.find(f"{{{_ATOM_NS}}}updated")))
        summary = _text(entry.find(f"{{{_ATOM_NS}}}summary"))
        items.append(NewsItem(
            external_id=link or f"atom:{title}",
            title=title,
            summary=summary,
            source_url=link,
            published_at=published,
        ))
    return items


class RssNewsAdapter(BaseAdapter):
    """Feed RSS/Atom voltado a notícias."""

    name = "rss"
    label = "Feed RSS de notícias"

    def __init__(self, feed_url: str, category: str = "",
                 title_filter: str = "", timeout: int = 25):
        self.feed_url = feed_url
        self.category = category
        self.title_filter = (title_filter or "").lower()
        self.timeout = timeout

    def fetch_page(self) -> str | None:
        try:
            response = requests.get(
                self.feed_url,
                headers={"User-Agent": USER_AGENT},
                timeout=self.timeout,
            )
            response.raise_for_status()
            response.encoding = "utf-8"
            return response.text
        except requests.RequestException:
            return None

    def fetch_news(self) -> list[NewsItem]:
        xml_text = self.fetch_page()
        if not xml_text:
            return []
        try:
            root = ET.fromstring(xml_text)
            items = _read_atom(xml_text) if root.tag.endswith("feed") else _read_rss(xml_text)
        except (ET.ParseError, ValueError):
            return []
        items = [item for item in items
                 if not self.title_filter or self.title_filter in item.title.lower()]
        for item in items:
            if self.category and not item.category:
                item.category = self.category
        return items


class GoogleNewsAdapter(RssNewsAdapter):
    """Feed do Google Notícias filtrado por assunto."""

    name = "google-news"
    label = "Google Notícias"

    def __init__(self, query: str = "concurso público", category: str = "Destaques",
                 limit: int = 25, timeout: int = 25):
        import urllib.parse

        params = urllib.parse.urlencode({
            "q": query,
            "hl": "pt-BR",
            "gl": "BR",
            "ceid": "BR:pt-419",
        })
        super().__init__(
            feed_url=f"https://news.google.com/rss/search?{params}",
            category=category,
            title_filter="",
            timeout=timeout,
        )
        self.query = query
        self.limit = limit

    def fetch_news(self) -> list[NewsItem]:
        items = super().fetch_news()
        return items[: self.limit] if self.limit else items