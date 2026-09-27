from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.questions.models import Question, QuestionSource, SearchRun


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
        response = self.client.get(f"/api/backoffice/content/questions/queue/?search_run={self.run.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.question.id)
        next_response = self.client.get(f"/api/backoffice/content/questions/queue/next/?search_run={self.run.id}")
        self.assertEqual(next_response.status_code, 200)
        self.assertEqual(next_response.data["question"]["id"], self.question.id)

    def test_approve_uses_moderation_rules(self):
        response = self.client.post(
            "/api/backoffice/content/questions/approve/",
            {"id": self.question.id, "explanation": "x" * 120},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.question.refresh_from_db()
        self.assertEqual(self.question.status, Question.Status.APPROVED)
        self.assertTrue(self.question.is_active)
