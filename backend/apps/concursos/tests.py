from unittest import mock
from datetime import date, datetime, timezone
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Concurso, NewsArticle
from .sources.base import ConcursoItem, NewsItem


def _concurso(**overrides):
    values = dict(
        external_id="ext-1", title="Prefeitura de Aracaju - SE abre concurso",
        source="pci", organization="Prefeitura de Aracaju",
        headline="10 vagas até R$ 5.000,00", roles=["Auxiliar"], levels=["Médio"],
        state="SE", status="open", deadline=date(2026, 10, 30),
        source_url="https://www.pciconcursos.com.br/noticias/x",
        vacancies=10, max_salary=5000,
    )
    values.update(overrides)
    return ConcursoItem(**values)


def _news(**overrides):
    values = dict(
        external_id="n-ext-1", title="Notícia teste sobre concurso",
        source="pci", summary="Resumo da notícia", category="Concursos",
        source_url="https://www.pciconcursos.com.br/noticias/x",
        published_at=datetime(2026, 9, 22, 15, 0, tzinfo=timezone.utc),
    )
    values.update(overrides)
    return NewsItem(**values)


class FakeAdapter:
    name = "fake"
    label = "Fonte fake"

    def __init__(self, concursos=(), news=()):
        self._concursos = list(concursos)
        self._news = list(news)

    def fetch_concursos(self):
        return self._concursos

    def fetch_news(self):
        return self._news


class SyncCommandTests(TestCase):
    def test_upsert_is_idempotent(self):
        adapter = FakeAdapter(concursos=[_concurso()], news=[_news()])
        with mock.patch("apps.concursos.management.commands.sync_sources.build_adapters", return_value=[adapter]):
            call_command("sync_sources", stdout=StringIO(), stderr=StringIO())
            call_command("sync_sources", stdout=StringIO(), stderr=StringIO())
        self.assertEqual(Concurso.objects.count(), 1)
        self.assertEqual(NewsArticle.objects.count(), 1)
        item = Concurso.objects.get(source="pci")
        self.assertEqual(item.state, "SE")
        self.assertEqual(item.vacancies, 10)
        self.assertEqual(item.max_salary, 5000)
        self.assertEqual(item.roles, ["Auxiliar"])
        self.assertEqual(item.levels, ["Médio"])

    def test_update_happens_on_second_run(self):
        adapter = FakeAdapter(concursos=[_concurso(title="Título antigo")])
        with mock.patch("apps.concursos.management.commands.sync_sources.build_adapters", return_value=[adapter]):
            call_command("sync_sources", stdout=StringIO(), stderr=StringIO())
        adapter._concursos[0].title = "Título novo"
        with mock.patch("apps.concursos.management.commands.sync_sources.build_adapters", return_value=[adapter]):
            call_command("sync_sources", stdout=StringIO(), stderr=StringIO())
        self.assertEqual(Concurso.objects.count(), 1)
        self.assertEqual(Concurso.objects.get().title, "Título novo")

    def test_news_slug_is_unique(self):
        adapter = FakeAdapter(news=[_news(external_id="a", title="Concurso igual"), _news(external_id="b", title="Concurso igual")])
        with mock.patch("apps.concursos.management.commands.sync_sources.build_adapters", return_value=[adapter]):
            call_command("sync_sources", stdout=StringIO(), stderr=StringIO())
        self.assertEqual(NewsArticle.objects.count(), 2)
        slugs = list(NewsArticle.objects.values_list("slug", flat=True))
        self.assertEqual(len(set(slugs)), 2)

    def test_dry_run_creates_nothing(self):
        adapter = FakeAdapter(concursos=[_concurso()], news=[_news()])
        with mock.patch("apps.concursos.management.commands.sync_sources.build_adapters", return_value=[adapter]):
            call_command("sync_sources", dry_run=True, stdout=StringIO(), stderr=StringIO())
        self.assertEqual(Concurso.objects.count(), 0)
        self.assertEqual(NewsArticle.objects.count(), 0)


class ConcursoApiTests(TestCase):
    def setUp(self):
        self.client = APIClient(HTTP_HOST="localhost")
        Concurso.objects.create(
            source="pci", external_id="1", title="Concurso SE 2026",
            organization="Órgão do SE", state="SE", status="open",
            deadline=date(2026, 10, 15), roles=["Auxiliar"], levels=["Médio"],
            headline="10 vagas", vacancies=10, max_salary=3000,
        )
        Concurso.objects.create(
            source="pci", external_id="2", title="Concurso nacional",
            organization="Órgão federal", state="", status="expected",
        )

    def test_list_and_filters(self):
        response = self.client.get("/api/concursos/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(self.client.get("/api/concursos/", {"state": "SE"}).data["count"], 1)
        self.assertEqual(self.client.get("/api/concursos/", {"status": "expected"}).data["count"], 1)
        self.assertEqual(self.client.get("/api/concursos/", {"search": "nacional"}).data["count"], 1)

    def test_facets(self):
        response = self.client.get("/api/concursos/", {"facets": "1"})
        self.assertEqual(response.data["facets"]["total"], 2)
        self.assertEqual(response.data["facets"]["statuses"], [{"status": "expected", "count": 1}, {"status": "open", "count": 1}])
        regions = {row["region"] for row in response.data["facets"]["regions"]}
        self.assertEqual(regions, set())
        areas = {row["area"]: row["count"] for row in response.data["facets"]["areas"]}
        self.assertEqual(areas, {"outros": 2})

    def test_region_filter(self):
        Concurso.objects.create(source="pci", external_id="4", title="Concurso PA", state="PA", region="NORTE", status="open")
        response = self.client.get("/api/concursos/", {"region": "norte"})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["region"], "NORTE")
        self.assertEqual(self.client.get("/api/concursos/", {"region": "sudeste"}).data["count"], 0)

    def test_area_filter(self):
        Concurso.objects.create(
            source="pci", external_id="5", title="Prefeitura contrata médico",
            organization="Prefeitura", status="open", roles=["Médico"], headline="1 vaga",
        )
        health = self.client.get("/api/concursos/", {"area": "saude"})
        self.assertEqual(health.data["count"], 1)
        self.assertEqual(health.data["results"][0]["title"], "Prefeitura contrata médico")
        self.assertEqual(self.client.get("/api/concursos/", {"area": "juridica"}).data["count"], 0)
        self.assertEqual(self.client.get("/api/concursos/", {"area": "saude,juridica"}).data["count"], 1)

    def test_open_first_ordering(self):
        Concurso.objects.create(source="pci", external_id="3", title="Zzz aberto", status="open", deadline=None)
        response = self.client.get("/api/concursos/")
        titles = [row["title"] for row in response.data["results"]]
        self.assertEqual(titles[0], "Concurso SE 2026")
        self.assertTrue(titles.index("Zzz aberto") < titles.index("Concurso nacional"))

    def test_invalid_limit(self):
        response = self.client.get("/api/concursos/", {"limit": "abc"})
        self.assertEqual(response.status_code, 400)


class NewsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient(HTTP_HOST="localhost")
        self.article = NewsArticle.objects.create(
            source="pci", external_id="n1", slug="primeira-noticia",
            title="Primeira notícia", summary="Resumo", category="Concursos",
            published_at=datetime(2026, 9, 22, tzinfo=timezone.utc),
        )
        NewsArticle.objects.create(
            source="google-news", external_id="n2", slug="segunda-noticia",
            title="Segunda notícia", summary="Outro", category="Destaques",
            published_at=datetime(2026, 9, 21, tzinfo=timezone.utc),
        )

    def test_list_with_filters_and_facets(self):
        response = self.client.get("/api/news/", {"facets": "1"})
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(self.client.get("/api/news/", {"category": "Concursos"}).data["count"], 1)
        self.assertEqual(self.client.get("/api/news/", {"search": "segunda"}).data["count"], 1)
        categories = {row["category"] for row in response.data["facets"]["categories"]}
        self.assertEqual(categories, {"Concursos", "Destaques"})

    def test_detail(self):
        response = self.client.get("/api/news/primeira-noticia/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Primeira notícia")
        self.assertEqual(self.client.get("/api/news/nao-existe/").status_code, 404)

    def test_unpublished_is_hidden(self):
        NewsArticle.objects.filter(slug="segunda-noticia").update(is_published=False)
        self.assertEqual(self.client.get("/api/news/").data["count"], 1)
        self.assertEqual(self.client.get("/api/news/segunda-noticia/").status_code, 404)


class PciParserTests(TestCase):
    def test_parses_real_page_snippet(self):
        from .sources.pci import _PciParser

        html = (
            '<h2>NACIONAL</h2>'
            '<div id="NACIONAL" class="ua"><div class="uf">NACIONAL</div></div>'
            '<div class="na" data-url="https://www.pciconcursos.com.br/noticias/fake-abre-concurso" onclick="myClick(event)">'
            '<div class="ca"><a href="https://www.pciconcursos.com.br/noticias/fake-abre-concurso" title="Fake abre concurso com salários de até R$ 7.181,50">Fake - Instituto</a></div>'
            '<div class="cb"><img data-src="x.png"></div>'
            '<div class="cc">&nbsp;</div>'
            '<div class="cd">15 vagas até R$ 7.181,50<br><span>Vários Cargos<br><span>Médio / Superior</span></span></div>'
            '<div class="ce"><span>21/10/2026</span></div>'
            '<div class="clear"></div>'
            '</div>&nbsp;</div>'
            '<h2>REGIÃO SUDESTE</h2>'
            '<div id="SP" class="ua"><div class="uf">SP</div></div>'
            '<div class="na" data-url="https://www.pciconcursos.com.br/noticias/prefeitura-sp-abre" onclick="myClick(event)">'
            '<div class="ca"><a href="https://www.pciconcursos.com.br/noticias/prefeitura-sp-abre" title="Prefeitura de SP abre concurso">Prefeitura de SP</a></div>'
            '<div class="cd">2 vagas<br><span>Zelador<br><span>Fundamental</span></span></div>'
            '<div class="ce"><span>02/11/2026</span></div>'
            '</div>&nbsp;</div>'
        )
        parser = _PciParser()
        parser.feed(html)
        self.assertEqual(len(parser.concursos), 2)
        self.assertEqual(len(parser.news), 2)
        first = parser.concursos[0]
        self.assertEqual(first.state, "")
        self.assertEqual(first.region, "Nacional")
        self.assertEqual(first.organization, "Fake - Instituto")
        self.assertEqual(first.headline, "15 vagas até R$ 7.181,50")
        self.assertEqual(first.vacancies, 15)
        self.assertEqual(first.max_salary, 7181)
        self.assertEqual(first.roles, ["Vários Cargos"])
        self.assertEqual(first.levels, ["Médio", "Superior"])
        self.assertEqual(first.deadline, date(2026, 10, 21))
        second = parser.concursos[1]
        self.assertEqual(second.state, "SP")
        self.assertEqual(second.region, "SUDESTE")
        self.assertEqual(second.vacancies, 2)
        self.assertEqual(second.levels, ["Fundamental"])