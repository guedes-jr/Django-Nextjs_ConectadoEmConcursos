"""Fase 1b — fonte de referência funcionando de ponta a ponta.

`data/reference_dataset.json` é o dataset sintético que substitui a fonte licenciada
enquanto ela não existe: mesmo adapter (`open_dataset`), mesmo pipeline, mesma fila.
O teste fecha o critério de pronto da fase — um adapter real, filtros declarados,
opções vindas da fonte e as quatro regras de duplicata — passando pela API que o
admin usa, não por atalho interno.
"""

import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.questions.ingest.sources import get_adapter
from apps.questions.models import Question, QuestionSource
from apps.questions.visibility import visible

DATASET = "apps/questions/data/reference_dataset.json"
SEARCH_URL = "/api/backoffice/content/question-search/"
QUEUE_URL = "/api/backoffice/content/questions/queue/"


@override_settings(QUESTIONS_SOURCES={"referencia": {"path": DATASET}})
class ReferenceSourceAdapterTests(TestCase):
    """O contrato do adapter: filtros declarados e opções lidas do próprio dataset."""

    def setUp(self):
        self.source = QuestionSource.objects.create(
            slug="referencia",
            name="Dataset de referência",
            kind=QuestionSource.Kind.OPEN_DATASET,
            license_name="CC0 1.0",
            is_active=True,
        )

    def test_dataset_path_resolves_relative_to_base_dir(self):
        adapter = get_adapter(self.source)
        self.assertEqual(
            adapter.dataset_path(),
            Path(settings.BASE_DIR) / DATASET,
        )

    def test_declares_filters_without_the_upload_one(self):
        keys = {spec.key for spec in get_adapter(self.source).filters()}
        self.assertEqual(
            keys,
            {
                "banca",
                "year_from",
                "year_to",
                "discipline",
                "exam",
                "role",
                "level",
                "state",
                "q",
                "has_explanation",
                "ordering",
            },
        )
        self.assertNotIn("file", keys)

    def test_options_come_from_the_dataset_itself(self):
        adapter = get_adapter(self.source)
        specs = {spec.key: spec for spec in adapter.filters()}
        bancas = {option.value: option.count for option in adapter.list_options(specs["banca"], {})}
        self.assertEqual(bancas, {"CESPE": 3, "FGV": 3, "IADES": 3})
        disciplinas = {
            option.value for option in adapter.list_options(specs["discipline"], {})
        }
        self.assertIn("Direito Administrativo", disciplinas)
        self.assertIn("Direito Constitucional", disciplinas)

    def test_dataset_meta_documents_the_source(self):
        payload = json.loads(
            (Path(settings.BASE_DIR) / DATASET).read_text(encoding="utf-8")
        )
        self.assertEqual(payload["meta"]["slug"], "referencia")
        self.assertTrue(payload["meta"]["license_name"])


@override_settings(QUESTIONS_SOURCES={"referencia": {"path": DATASET}})
class ReferenceSourceSearchTests(TestCase):
    """A mesma busca que o admin dispara na tela, ponta a ponta."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="curador", password="safe-password", is_staff=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.source = QuestionSource.objects.create(
            slug="referencia",
            name="Dataset de referência",
            kind=QuestionSource.Kind.OPEN_DATASET,
            home_url="https://exemplo.test/datasets/questoes-referencia",
            license_name="CC0 1.0",
            attribution="Dataset sintético de referência",
            is_active=True,
        )

    def search(self, filters=None, limit=None):
        body = {"source": self.source.slug, "filters": filters or {}}
        if limit is not None:
            body["limit"] = limit
        return self.client.post(SEARCH_URL, body, format="json")

    def test_full_search_queues_everything_as_pending(self):
        response = self.search()

        self.assertEqual(response.status_code, 201)
        payload = response.data
        self.assertEqual(payload["status"], "done")
        self.assertEqual(payload["counts"]["seen"], 9)
        self.assertEqual(payload["counts"]["created"], 7)
        self.assertEqual(payload["counts"]["duplicates_skipped"], 2)
        self.assertEqual(payload["counts"]["errors"], 0)

        questions = Question.objects.filter(source=self.source)
        self.assertEqual(questions.count(), 7)
        self.assertFalse(questions.exclude(status=Question.Status.PENDING).exists())
        self.assertFalse(visible(questions).exists())
        self.assertTrue(questions.exclude(content_hash="").exists())
        self.assertTrue(questions.filter(search_run_id=payload["id"]).count() == 7)
        self.assertTrue(questions.exclude(external_id=None).exists())

    def test_banca_alias_is_normalized_on_both_sides(self):
        response = self.search({"banca": "CEBRASPE"})

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["counts"]["created"], 3)
        bancas = set(
            Question.objects.filter(source=self.source).values_list("banca", flat=True)
        )
        self.assertEqual(bancas, {"CEBRASPE"})
        self.assertFalse(Question.objects.filter(banca="CESPE").exists())

    def test_duplicate_rules_decide_each_case(self):
        self.search()

        by_external_id = {
            question.external_id: question
            for question in Question.objects.filter(source=self.source)
        }
        self.assertNotIn("ref-005", by_external_id)  # idêntica a ref-002
        self.assertNotIn("ref-006", by_external_id)  # 93% igual, mesmo gabarito
        self.assertEqual(
            by_external_id["ref-001"].review_note, ""
        )  # a original não leva alerta
        self.assertIn("69% igual", by_external_id["ref-004"].review_note)  # banda de suspeita
        self.assertIn("gabarito", by_external_id["ref-009"].review_note)  # conflito
        self.assertIn("97% igual", by_external_id["ref-009"].review_note)
        self.assertNotIn("≠", by_external_id["ref-004"].review_note)
        self.assertEqual(by_external_id["ref-007"].review_note, "")  # enunciado curto
        self.assertEqual(by_external_id["ref-007"].options, ["Certo", "Errado"])

    def test_duplicate_preview_points_to_the_original(self):
        response = self.search()
        run = self.source.runs.get(pk=response.data["id"])
        original = Question.objects.get(source=self.source, external_id="ref-002")

        preview = {row["external_id"]: row for row in run.duplicates_preview}
        self.assertEqual(preview["ref-005"]["match_id"], original.id)
        self.assertTrue(preview["ref-005"]["exact"])
        self.assertEqual(preview["ref-005"]["score"], 100)
        self.assertEqual(preview["ref-006"]["score"], 94)
        self.assertFalse(preview["ref-006"]["exact"])

    def test_rerun_of_the_same_search_imports_nothing_new(self):
        self.search()
        response = self.search()

        self.assertEqual(response.data["counts"]["created"], 0)
        self.assertEqual(response.data["counts"]["unchanged"], 7)
        self.assertEqual(response.data["counts"]["duplicates_skipped"], 2)
        self.assertEqual(Question.objects.filter(source=self.source).count(), 7)

    def test_pagination_keeps_the_cursor_for_the_next_batch(self):
        first = self.search(limit=4)

        self.assertEqual(first.data["counts"]["created"], 4)
        self.assertEqual(first.data["limit"], 4)
        self.assertEqual(first.data["next_page"], 2)

        pages = [first.data]
        run_id = first.data["id"]
        while pages[-1]["next_page"]:
            response = self.client.post(
                f"{SEARCH_URL}{run_id}/continue/", {}, format="json"
            )
            self.assertEqual(response.status_code, 201)
            # Sem `limit` no corpo, a parte seguinte herda o da execução original:
            # é isso que torna `next_page` reproduzível.
            self.assertEqual(response.data["limit"], 4)
            run_id = response.data["id"]
            pages.append(response.data)

        self.assertEqual([page["next_page"] for page in pages], [2, 3, None])
        self.assertEqual([page["counts"]["created"] for page in pages], [4, 2, 1])
        self.assertEqual(
            sum(page["counts"]["duplicates_skipped"] for page in pages), 2
        )
        self.assertEqual(Question.objects.filter(source=self.source).count(), 7)

    def test_has_explanation_filter_narrows_the_search(self):
        response = self.search({"has_explanation": "1"})

        self.assertEqual(response.data["counts"]["seen"], 3)
        self.assertEqual(response.data["counts"]["created"], 3)

    def test_text_filter_keeps_the_original_and_drops_the_twin(self):
        response = self.search({"q": "estabilidade"})

        self.assertEqual(response.data["counts"]["seen"], 2)
        self.assertEqual(response.data["counts"]["created"], 1)
        self.assertEqual(response.data["counts"]["duplicates_skipped"], 1)

    def test_source_without_license_is_refused(self):
        self.source.license_name = ""
        self.source.save(update_fields=["license_name"])

        response = self.search()

        self.assertEqual(response.status_code, 400)
        self.assertIn("source", response.data)

    def test_queue_payload_carries_duplicates_and_conflict(self):
        self.search()
        ids = {
            question.external_id: question.id
            for question in Question.objects.filter(source=self.source)
        }

        response = self.client.get(f"{QUEUE_URL}?search_run__isnull=false")
        self.assertEqual(response.status_code, 200)
        rows = {row["id"]: row for row in response.data["results"]}

        conflict = rows[ids["ref-009"]]
        self.assertTrue(conflict["conflict"])
        self.assertEqual(conflict["duplicates"][0]["id"], ids["ref-003"])
        self.assertGreaterEqual(conflict["duplicates"][0]["percent"], 80)
        self.assertTrue(conflict["duplicates"][0]["answer_conflict"])

        suspected = rows[ids["ref-004"]]
        self.assertFalse(suspected["conflict"])
        # 71% com ref-009 e 69% com ref-003: as duas cairam na banda de suspeita,
        # então o admin vê as duas em vez de só a mais próxima.
        self.assertEqual(
            {row["id"] for row in suspected["duplicates"]}, {ids["ref-003"], ids["ref-009"]}
        )
        self.assertTrue(
            all(60 <= row["percent"] < 80 for row in suspected["duplicates"])
        )
        self.assertFalse(any(row["answer_conflict"] for row in suspected["duplicates"]))

        clean = rows[ids["ref-007"]]
        self.assertEqual(clean["duplicates"], [])
        self.assertFalse(clean["conflict"])

    def test_queue_next_returns_the_first_pending_of_the_run(self):
        run = self.search().data

        response = self.client.get(f"{QUEUE_URL}next/?search_run={run['id']}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["question"]["search_run"], run["id"])
        self.assertEqual(response.data["question"]["status"], Question.Status.PENDING)
