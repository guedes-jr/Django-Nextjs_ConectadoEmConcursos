from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.questions.models import OfficialExamDocument, OfficialExamDownload, OfficialExamPortal


class OfficialExamApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("official-admin", password="safe-password", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.portal = OfficialExamPortal.objects.create(
            slug="official-api", name="Portal oficial", catalog_url="https://www.gov.br/catalogo", allowed_hosts=["www.gov.br"],
        )
        self.proof = OfficialExamDocument.objects.create(
            portal=self.portal, title="Prova", year=2025, kind=OfficialExamDocument.Kind.EXAM,
            source_url="https://www.gov.br/prova.pdf",
        )

    @patch("django_q.tasks.async_task")
    def test_download_endpoint_enqueues_a_running_attempt(self, async_task):
        response = self.client.post(f"/api/backoffice/content/official-exams/documents/{self.proof.id}/download/", {}, format="json")

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], OfficialExamDownload.Status.RUNNING)
        self.assertTrue(async_task.called)
        self.assertTrue(OfficialExamDownload.objects.filter(document=self.proof, status=OfficialExamDownload.Status.RUNNING).exists())

    def test_pair_refuses_two_proofs(self):
        other_proof = OfficialExamDocument.objects.create(
            portal=self.portal, title="Outra prova", year=2025, kind=OfficialExamDocument.Kind.EXAM,
            source_url="https://www.gov.br/outra-prova.pdf",
        )

        response = self.client.post(
            f"/api/backoffice/content/official-exams/documents/{self.proof.id}/pair/",
            {"paired_with": other_proof.id}, format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Associe uma prova", response.data["detail"])

    def test_pair_associates_proof_and_answer_key_bidirectionally(self):
        answer_key = OfficialExamDocument.objects.create(
            portal=self.portal, title="Gabarito", year=2025,
            kind=OfficialExamDocument.Kind.ANSWER_KEY_FINAL, source_url="https://www.gov.br/gabarito.pdf",
        )

        response = self.client.post(
            f"/api/backoffice/content/official-exams/documents/{self.proof.id}/pair/",
            {"paired_with": answer_key.id}, format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.proof.refresh_from_db()
        answer_key.refresh_from_db()
        self.assertEqual(self.proof.paired_with_id, answer_key.id)
        self.assertEqual(answer_key.paired_with_id, self.proof.id)
