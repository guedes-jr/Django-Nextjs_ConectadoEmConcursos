from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.questions.ingest.pipeline import refresh_stem_index
from apps.questions.models import ErrorReport, Question, QuestionSource, SearchRun, UserAnswer
from apps.questions.visibility import visible

QUEUE_URL = "/api/backoffice/content/questions/queue/"

NEAR_TWIN_STATEMENT = (
    "Considere o regime jurídico dos servidores públicos e assinale a alternativa "
    "correta sobre a estabilidade funcional e o processo administrativo disciplinar "
    "do servidor estável no serviço público brasileiro."
)

# Mesmo conteúdo, redação diferente: entra pela similaridade, não pelo hash.
REWORDED_TWIN_STATEMENT = (
    "Considere o regime jurídico dos servidores públicos e assinale a alternativa "
    "correta sobre a estabilidade funcional e sobre o processo administrativo "
    "disciplinar aplicável ao servidor estável no serviço público do Brasil."
)

ROUTES = (
    ("get", "/api/backoffice/content/sources/"),
    ("get", "/api/backoffice/content/sources/fonte/filters/"),
    ("get", "/api/backoffice/content/question-search/"),
    ("get", "/api/backoffice/content/question-search/1/"),
    ("post", "/api/backoffice/content/question-search/1/continue/"),
    ("post", "/api/backoffice/content/question-search/1/rerun/"),
    ("post", "/api/backoffice/content/question-search/1/import-skipped/"),
    ("get", QUEUE_URL),
    ("get", f"{QUEUE_URL}next/"),
    ("get", "/api/backoffice/content/questions/rejection-reasons/"),
    ("post", "/api/backoffice/content/questions/draft/"),
    ("post", "/api/backoffice/content/questions/approve/"),
    ("post", "/api/backoffice/content/questions/reject/"),
)


class QuestionContentApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="content-admin", password="safe-password", is_staff=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.source = QuestionSource.objects.create(
            slug="source-api", name="Fonte API", kind="local_file",
            license_name="Licença de teste", is_active=True,
        )
        self.run = SearchRun.objects.create(source=self.source, filters={})
        self.question = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="CEBRASPE", year=2024, statement="Enunciado completo para revisão.",
            options=["A", "B"], correct_answer=0,
        )

    def test_sources_only_lists_active_sources(self):
        QuestionSource.objects.create(slug="hidden", name="Inativa", license_name="x")
        response = self.client.get("/api/backoffice/content/sources/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["slug"] for row in response.data["results"]], ["source-api"])

    def test_queue_filters_by_search_run_and_next_is_fifo(self):
        response = self.client.get(f"{QUEUE_URL}?search_run={self.run.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.question.id)
        next_response = self.client.get(f"{QUEUE_URL}next/?search_run={self.run.id}")
        self.assertEqual(next_response.status_code, 200)
        self.assertEqual(next_response.data["question"]["id"], self.question.id)

    def test_queue_orders_by_priority(self):
        calm = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="CEBRASPE", year=2024, statement="Enunciado tranquilo da fila.",
            options=["A", "B"], correct_answer=0,
        )
        demanded = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="CEBRASPE", year=2024, statement="Enunciado muito cobrado da fila.",
            options=["A", "B"], correct_answer=0,
        )
        ErrorReport.objects.create(
            question=demanded, user=self.user,
            description="Solicitação de gabarito comentado.",
        )
        UserAnswer.objects.create(
            user=self.user, question=calm, selected_answer=1, is_correct=False,
        )

        response = self.client.get(QUEUE_URL)

        self.assertEqual(
            [row["id"] for row in response.data["results"]][:2], [demanded.id, calm.id]
        )

    def test_queue_inside_a_search_run_is_fifo(self):
        Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito", banca="CEBRASPE",
            year=2024, statement="Entrou depois na mesma busca.", options=["A", "B"], correct_answer=0,
        )
        ErrorReport.objects.create(question=self.question, user=self.user, description="Muito cobrado.")

        response = self.client.get(f"{QUEUE_URL}?search_run={self.run.id}")

        self.assertEqual(
            [row["id"] for row in response.data["results"]],
            [self.question.id, self.question.id + 1],
        )

    def test_run_detail_reports_how_much_was_already_reviewed(self):
        self.assertEqual(self.client.get("/api/backoffice/content/question-search/1/").data["reviewed_count"], 0)
        self.question.status = Question.Status.APPROVED
        self.question.save()
        payload = self.client.get(f"/api/backoffice/content/question-search/{self.run.id}/").data
        self.assertEqual(payload["reviewed_count"], 1)
        self.assertEqual(payload["questions_count"], 1)

    def test_queue_can_filter_by_duplicates_and_by_answer_conflict(self):
        self.question.statement = NEAR_TWIN_STATEMENT
        self.question.correct_answer = 0
        self.question.save()
        twin = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="FGV", year=2023, statement=REWORDED_TWIN_STATEMENT,
            options=["A", "B"], correct_answer=1,
        )
        lonely = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="FGV", year=2023, statement="Enunciado sem nenhum parecido na base.",
            options=["A", "B"], correct_answer=0,
        )
        for question in (self.question, twin, lonely):
            refresh_stem_index(question)

        with_duplicates = self.client.get(f"{QUEUE_URL}?duplicates=1")
        conflicts = self.client.get(f"{QUEUE_URL}?conflict=1")

        self.assertEqual(
            sorted(row["id"] for row in with_duplicates.data["results"]),
            sorted([self.question.id, twin.id]),
        )
        # Gabaritos diferentes com enunciado parecido: só os dois entram no conflito.
        self.assertEqual(
            sorted(row["id"] for row in conflicts.data["results"]),
            sorted([self.question.id, twin.id]),
        )

    def test_rejection_reasons_come_from_the_moderation_rules(self):
        response = self.client.get("/api/backoffice/content/questions/rejection-reasons/")
        self.assertEqual(response.status_code, 200)
        codes = [row["code"] for row in response.data]
        self.assertIn("duplicada", codes)
        self.assertIn("gabarito_errado", codes)
        self.assertTrue(all(row["label"] for row in response.data))

    def test_review_payload_carries_provenance_and_duplicates(self):
        self.question.statement = NEAR_TWIN_STATEMENT
        self.question.save()
        twin = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="FGV", year=2023, statement=REWORDED_TWIN_STATEMENT,
            options=["A", "B"], correct_answer=0,
        )
        for question in (self.question, twin):
            refresh_stem_index(question)

        payload = self.client.get(f"{QUEUE_URL}next/").data["question"]

        self.assertEqual(payload["statement"], self.question.statement)
        self.assertEqual(payload["options"], self.question.options)
        self.assertEqual(payload["correct_answer"], 0)
        self.assertEqual(payload["external_id"], self.question.external_id)
        self.assertTrue(payload["content_hash"])
        self.assertEqual(payload["source"]["slug"], self.source.slug)
        self.assertEqual(payload["source"]["license_name"], "Licença de teste")
        self.assertEqual(payload["duplicates"][0]["id"], twin.id)
        self.assertGreaterEqual(payload["duplicates"][0]["percent"], 80)
        self.assertFalse(payload["duplicates"][0]["answer_conflict"])
        self.assertFalse(payload["conflict"])

    def test_review_payload_flags_a_conflicting_gabarito(self):
        original = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="CEBRASPE", year=2023, statement=NEAR_TWIN_STATEMENT,
            options=["A", "B"], correct_answer=0,
        )
        refresh_stem_index(original)
        self.question.statement = NEAR_TWIN_STATEMENT
        self.question.correct_answer = 1
        self.question.save()
        refresh_stem_index(self.question)

        payload = self.client.get(f"{QUEUE_URL}next/").data["question"]

        self.assertTrue(payload["conflict"])
        self.assertEqual(payload["duplicates"][0]["id"], original.id)
        self.assertTrue(payload["duplicates"][0]["answer_conflict"])

    def test_short_statement_has_no_duplicates(self):
        self.question.statement = "Julgue o item a seguir."
        self.question.save()
        refresh_stem_index(self.question)

        payload = self.client.get(f"{QUEUE_URL}next/").data["question"]

        self.assertEqual(payload["duplicates"], [])
        self.assertFalse(payload["conflict"])

    def test_approve_uses_moderation_rules(self):
        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {"id": self.question.id, "explanation": "x" * 120},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.question.refresh_from_db()
        self.assertEqual(self.question.status, Question.Status.APPROVED)
        self.assertTrue(visible().filter(pk=self.question.pk).exists())

    def test_approve_without_enough_explanation_is_refused(self):
        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {"id": self.question.id, "explanation": "curta"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("explanation", response.data)
        self.question.refresh_from_db()
        self.assertEqual(self.question.status, Question.Status.PENDING)

    def test_reject_requires_a_reason_code(self):
        response = self.client.post(
            "/api/backoffice/content/questions/reject/",
            {"id": self.question.id, "reason": "enunciado com erro"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.question.refresh_from_db()
        self.assertEqual(self.question.status, Question.Status.PENDING)

    def test_second_decision_on_the_same_question_is_a_conflict(self):
        self.client.post(
            "/api/backoffice/content/questions/approve/",
            {"id": self.question.id, "explanation": "x" * 120},
            format="json",
        )
        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {"id": self.question.id, "explanation": "x" * 120},
            format="json",
        )
        self.assertEqual(response.status_code, 409)

    def test_batch_decision_reports_every_question(self):
        other = Question.objects.create(
            source=self.source, search_run=self.run, discipline="Direito",
            banca="FGV", year=2023, statement="Outro enunciado da fila.",
            options=["A", "B"], correct_answer=0,
        )

        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {"ids": [self.question.id, other.id], "explanation": "x" * 120},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            sorted(row["id"] for row in response.data["results"]),
            sorted([self.question.id, other.id]),
        )
        self.assertEqual(
            Question.objects.filter(status=Question.Status.APPROVED).count(), 2
        )

    def test_missing_question_is_a_404(self):
        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {"id": 9999, "explanation": "x" * 120},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_approve_reports_a_question_changed_by_another_reviewer(self):
        """A tela manda o `updated_at` que leu: se mudou, é 409 e nada é gravado."""
        self.question.explanation = "Rascunho de outro revisor."
        self.question.save(update_fields=["explanation", "updated_at"])

        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {
                "id": self.question.id,
                "explanation": "x" * 120,
                "updated_at": "2020-01-01T00:00:00Z",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "stale")
        self.assertIn("outro revisor", response.data["detail"])
        self.question.refresh_from_db()
        self.assertEqual(self.question.status, Question.Status.PENDING)
        self.assertEqual(self.question.explanation, "Rascunho de outro revisor.")

    def test_draft_saves_the_note_without_reviewing(self):
        response = self.client.post(
            "/api/backoffice/content/questions/draft/",
            {"id": self.question.id, "note": "Gabarito confere; await duplicata."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.question.refresh_from_db()
        self.assertEqual(self.question.review_note, "Gabarito confere; await duplicata.")
        self.assertEqual(self.question.status, Question.Status.PENDING)

    def test_approve_accepts_the_updated_at_the_screen_read(self):
        payload = self.client.get(f"{QUEUE_URL}next/").data["question"]
        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {
                "id": self.question.id,
                "explanation": "x" * 120,
                "updated_at": payload["updated_at"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)


class QuestionContentApiPermissionTests(TestCase):
    """Nenhuma rota de conteúdo responde para quem não é staff."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="comum", password="safe-password"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_every_route_is_closed_to_non_staff(self):
        for method, url in ROUTES:
            with self.subTest(url=url, method=method):
                response = getattr(self.client, method)(url, {}, format="json")
                self.assertEqual(response.status_code, 403)
