from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.questions.models import Question
from .models import CommunityPost, ExamSubmission, Flashcard, Notebook, SimulationRun


class SimulationRunTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="sim", password="pw")
        self.other = get_user_model().objects.create_user(username="outro", password="pw")
        self.client.force_authenticate(self.user)
        self.run = SimulationRun.objects.create(
            user=self.user, status=SimulationRun.Status.FINISHED,
            score=1, total=3, question_count=3,
            question_ids=[1, 2, 3],
            answers=[{"question_id": 1, "selected_answer": 0, "correct_answer": 0, "is_correct": True}],
        )

    def test_delete_own_simulation(self):
        response = self.client.delete(f"/api/workspace/simulations/{self.run.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SimulationRun.objects.filter(pk=self.run.id).exists())

    def test_delete_another_users_simulation_denied(self):
        other_run = SimulationRun.objects.create(
            user=self.other, status=SimulationRun.Status.FINISHED,
            score=0, total=1, question_count=1, question_ids=[1],
        )
        response = self.client.delete(f"/api/workspace/simulations/{other_run.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(SimulationRun.objects.filter(pk=other_run.id).exists())

    def test_delete_unknown_simulation(self):
        response = self.client.delete("/api/workspace/simulations/9999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CommunityTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="comuario", password="pw")
        self.other = get_user_model().objects.create_user(username="outro", password="pw")
        self.client.force_authenticate(self.user)

    def test_create_forum_thread_and_reply(self):
        response = self.client.post(
            "/api/workspace/community/", {"kind": "forum", "title": "Dúvida", "content": "Alguém pode ajudar?"}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["is_owner"])
        thread_id = response.data["id"]
        response = self.client.post(
            "/api/workspace/community/", {"kind": "forum", "content": "Ajuda aqui", "parent_id": thread_id}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("parent_id", response.data)

    def test_community_get_kind_filter(self):
        self.client.post("/api/workspace/community/", {"kind": "feed", "content": "Hoje rendeu!"})
        response = self.client.get("/api/workspace/community/?kind=forum")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_delete_own_post_and_other_denied(self):
        post = CommunityPost.objects.create(user=self.user, kind="forum", title="T", content="C")
        other_post = CommunityPost.objects.create(user=self.other, kind="forum", title="T2", content="C2")
        response = self.client.delete(f"/api/workspace/community/{post.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        response = self.client.delete(f"/api/workspace/community/{other_post.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class FlashcardTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="flash", password="pw")
        self.client.force_authenticate(self.user)

    def test_spaced_repetition_doubles_interval(self):
        response = self.client.post("/api/workspace/flashcards/", {"front": "F", "back": "B", "discipline": "D"})
        card_id = response.data["id"]
        response = self.client.patch(f"/api/workspace/flashcards/{card_id}/", {"correct": True}, format="json")
        self.assertEqual(response.data["interval_days"], 1)
        response = self.client.patch(f"/api/workspace/flashcards/{card_id}/", {"correct": True}, format="json")
        self.assertEqual(response.data["interval_days"], 2)


class NotebookTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="caderno", password="pw")
        self.client.force_authenticate(self.user)
        self.question = Question.objects.create(
            statement="?", options=["a", "b"], correct_answer=0,
            discipline="A", banca="B", year=2024,
            status=Question.Status.APPROVED,
        )

    def test_notebook_add_remove_question(self):
        response = self.client.post("/api/workspace/notebooks/", {"title": "CB"})
        notebook_id = response.data["id"]
        response = self.client.post(f"/api/workspace/notebooks/{notebook_id}/questions/", {"question_id": self.question.id})
        self.assertCountEqual(response.data["question_ids"], [self.question.id])
        response = self.client.delete(f"/api/workspace/notebooks/{notebook_id}/questions/", {"question_id": self.question.id}, format="json")
        self.assertCountEqual(response.data["question_ids"], [])


class SubmissionUploadTests(APITestCase):
    """O envio do aluno é a entrada da Fase 5: sem declaração de direitos, não entra."""

    URL = "/api/workspace/submissions/"

    def setUp(self):
        self.user = get_user_model().objects.create_user(username="envia", password="pw")
        self.client.force_authenticate(self.user)

    def test_upload_without_rights_is_refused(self):
        response = self.client.post(
            self.URL, {"title": "Prova X", "source_url": "https://exemplo.inicial/p"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("autorização", response.data["detail"])
        self.assertEqual(ExamSubmission.objects.count(), 0)

    def test_link_submission_stores_the_rights_confirmation(self):
        response = self.client.post(
            self.URL,
            {"title": "Prova X", "source_url": "https://exemplo.inicial/p", "rights_confirmed": "true"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        submission = ExamSubmission.objects.get(pk=response.data["id"])
        self.assertTrue(submission.rights_confirmed)
        self.assertEqual(submission.status, ExamSubmission.Status.PENDING)

    def test_multipart_upload_accepts_the_parseable_formats_too(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        payload = b'{"questions": []}'
        response = self.client.post(
            self.URL,
            {
                "title": "Prova em JSON",
                "file": SimpleUploadedFile("prova.json", payload, content_type="application/json"),
                "rights_confirmed": "on",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ExamSubmission.objects.get(pk=response.data["id"]).rights_confirmed)

    def test_the_student_list_shows_the_conversion_progress(self):
        submission = ExamSubmission.objects.create(
            user=self.user, title="Prova X", source_url="https://exemplo.inicial/p",
            rights_confirmed=True, converted_questions=12,
        )

        response = self.client.get(self.URL)

        row = response.data[0]
        self.assertEqual(row["id"], submission.id)
        self.assertTrue(row["rights_confirmed"])
        self.assertEqual(row["converted_questions"], 12)

    def test_another_student_does_not_see_the_submission(self):
        ExamSubmission.objects.create(
            user=get_user_model().objects.create_user(username="outro", password="pw"),
            title="Prova alheia", rights_confirmed=True,
        )

        self.assertEqual(self.client.get(self.URL).data, [])
