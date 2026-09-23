"""Adaptador para o PCI Concursos.

Não existe API pública oficial no PCI, então este adaptador lê a página
HTML "Concursos Abertos" (nacional), que lista todos os concursos junto da
região/UF de cada um. A estrutura é estável:

    <h2>REGIÃO SUDESTE</h2>
    <div id="SP" class="ua"><div class="uf">SP</div>...</div>
    <div class="na" data-url=".../noticias/slug">
      <div class="ca"><a href="..." title="Manchete">Órgão</a></div>
      <div class="cb"><img data-src="logo"></div>
      <div class="cd">15 vagas até R$ 7.181,50<br><span>Vários Cargos<br><span>Médio / Superior</span></span></div>
      <div class="ce"><span>21/10/2026</span></div>
    </div>

Cada item também corresponde a uma notícia do portal, então geramos tanto
registros de concurso quanto de notícia a partir da mesma leitura.
"""

import re
from datetime import datetime
from html.parser import HTMLParser

import requests

from .base import BaseAdapter, ConcursoItem, NewsItem

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124 Safari/537.36"
)

_VAGAS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*vag", re.I)
_SALARIO_RE = re.compile(r"R\$\s*([\d.]+),\d{2}")
_DATA_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")

_UFS = {
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG",
    "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR",
    "RS", "SC", "SE", "SP", "TO",
}


def parse_vacancies(value: str) -> int | None:
    match = _VAGAS_RE.search(value)
    if not match:
        return None
    return int(match.group(1).replace(".", ""))


def parse_salary(value: str) -> int | None:
    match = _SALARIO_RE.search(value)
    if not match:
        return None
    return int(match.group(1).replace(".", ""))


def split_roles(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def split_levels(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        for part in re.split(r"\s*/\s*", value):
            part = part.strip()
            if part:
                result.append(part)
    return result


class _PciParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.concursos: list[ConcursoItem] = []
        self.news: list[NewsItem] = []
        self.region = "Nacional"
        self.state = ""
        self._block: dict | None = None
        self._depth = 0
        self._section: str | None = None
        self._cd_parts: list[str] = []
        self._cd_buffer = ""
        self._ce_buffer = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if tag == "div" and "ua" in classes:
            self.state = "NACIONAL" if attrs.get("id") == "NACIONAL" else (attrs.get("id") or "")
            if self.state == "NACIONAL":
                self.region = "Nacional"
            return
        if tag == "div" and "na" in classes and self._block is None:
            url = attrs.get("data-url", "")
            if url and "pciconcursos" in url:
                self._block = {"url": url, "title": "", "org": ""}
                self._depth = 1
            return
        if self._block is None:
            return
        if tag == "div":
            self._depth += 1
            if self._section == "cd":
                self._flush_cd()
            if "ca" in classes:
                self._section = "ca"
            elif "cd" in classes:
                self._section = "cd"
                self._cd_parts = []
                self._cd_buffer = ""
            elif "ce" in classes:
                self._section = "ce"
                self._ce_buffer = ""
            else:
                self._section = None
            return
        if tag == "a" and self._section == "ca":
            self._block["url"] = attrs.get("href") or self._block["url"]
            self._block["title"] = attrs.get("title") or ""
            return
        if self._section == "cd" and tag in ("br", "span"):
            self._flush_cd()
            return

    def handle_endtag(self, tag):
        if tag == "div":
            if self._block is None:
                return
            if self._section == "cd":
                self._flush_cd()
            self._depth -= 1
            if self._depth <= 0:
                self._finalize_block()
            return
        if tag == "span" and self._section == "cd":
            self._flush_cd()
            return

    def handle_data(self, data):
        if self._block is None:
            raw = data.strip()
            if not raw:
                return
            if raw.upper().startswith("REGIÃO"):
                self.region = re.sub(r"^REGIÃO\s+", "", raw, flags=re.I).strip()
            return
        if self._section == "ca":
            text = data.strip()
            if text:
                self._block["org"] += text
            return
        if self._section == "cd":
            self._cd_buffer += data
            return
        if self._section == "ce":
            self._ce_buffer += data

    def _flush_cd(self):
        if self._section == "cd" and self._cd_buffer.strip():
            self._cd_parts.append(self._cd_buffer.strip())
        self._cd_buffer = ""

    def _finalize_block(self):
        self._flush_cd()
        if not self._block:
            return
        parts = self._cd_parts
        self._cd_parts = []
        self._ce_buffer = self._ce_buffer.strip()
        block, self._block = self._block, None
        self._depth = 0
        self._section = None

        url = block["url"]
        title = block["title"].strip()
        org = block["org"].strip()
        headline = parts[0] if parts else ""
        roles = split_roles(parts[1]) if len(parts) > 1 else []
        levels = split_levels(parts[2:]) if len(parts) > 2 else []
        deadline = None
        match = _DATA_RE.search(self._ce_buffer)
        if match:
            day, month, year = match.groups()
            deadline = datetime(int(year), int(month), int(day)).date()
        state = (self.state or "").upper()
        state = state if state in _UFS else ""

        name = title or org
        if not name:
            return
        self.concursos.append(ConcursoItem(
            external_id=url,
            title=name,
            source="pci",
            organization=org,
            headline=headline,
            roles=roles,
            levels=levels,
            state=state,
            region=self.region,
            status="open",
            deadline=deadline,
            source_url=url,
            vacancies=parse_vacancies(headline),
            max_salary=parse_salary(headline),
        ))
        if title:
            self.news.append(NewsItem(
                external_id=url,
                title=title,
                source="pci",
                summary=headline,
                category="Concursos",
                source_url=url,
            ))


class PciAdapter(BaseAdapter):
    name = "pci"
    label = "PCI Concursos"

    def __init__(self, url: str = "https://www.pciconcursos.com.br/concursos/",
                 timeout: int = 25, delay: float = 0.0):
        self.url = url
        self.timeout = timeout
        self.delay = delay

    def fetch_page(self) -> str | None:
        try:
            response = requests.get(
                self.url,
                headers={"User-Agent": USER_AGENT},
                timeout=self.timeout,
            )
            response.raise_for_status()
            response.encoding = "utf-8"
            return response.text
        except requests.RequestException:
            return None

    def _items(self) -> tuple[list[ConcursoItem], list[NewsItem]]:
        html = self.fetch_page()
        if not html:
            return [], []
        parser = _PciParser()
        try:
            parser.feed(html)
        except Exception:
            return [], []
        return parser.concursos, parser.news

    def fetch_concursos(self) -> list[ConcursoItem]:
        concursos, _ = self._items()
        return concursos

    def fetch_news(self) -> list[NewsItem]:
        _, news = self._items()
        return news