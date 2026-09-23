from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.questions.models import Question, UserAnswer
from .models import StudyBlock, StudyPlan, StudySession


class StudyPlanTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="estudante", password="safe-test-pass")
        self.other = get_user_model().objects.create_user(username="outro", password="safe-test-pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.payload = {
            "goal": "Técnico Judiciário", "disciplines": ["Português", "Direito"],
            "weekdays": list(range(7)), "minutes_per_day": 60,
        }

    def test_create_and_read_plan(self):
        response = self.client.post("/api/study-plan/", self.payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(StudyPlan.objects.count(), 1)
        self.assertGreater(len(response.data["blocks"]), 0)
        self.assertEqual(self.client.get("/api/study-plan/").data["goal"], "Técnico Judiciário")
        self.assertEqual(self.client.post("/api/study-plan/", self.payload, format="json").status_code, 409)

    def test_invalid_input_and_private_blocks(self):
        self.assertEqual(self.client.post("/api/study-plan/", {"goal": ""}, format="json").status_code, 400)
        self.client.post("/api/study-plan/", self.payload, format="json")
        item = StudyBlock.objects.first()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.patch(f"/api/study-plan/blocks/{item.id}/", {"status": "done"}, format="json").status_code, 404)
        self.assertEqual(self.client.post(f"/api/study-plan/blocks/{item.id}/sessions/", {"minutes": 20}, format="json").status_code, 404)

    def test_record_session_and_preserve_history_on_edit(self):
        self.client.post("/api/study-plan/", self.payload, format="json")
        item = StudyBlock.objects.first()
        response = self.client.post(f"/api/study-plan/blocks/{item.id}/sessions/", {"minutes": 35}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["actual_minutes"], 35)
        self.assertEqual(self.client.patch("/api/study-plan/", {**self.payload, "minutes_per_day": 90}, format="json").status_code, 200)
        self.assertTrue(StudySession.objects.filter(block=item, minutes=35).exists())

    def test_question_activity_updates_progress(self):
        self.client.post("/api/study-plan/", self.payload, format="json")
        item = StudyBlock.objects.filter(kind="questions").first()
        item.date = timezone.localdate()
        item.discipline = "Português"
        item.save(update_fields=["date", "discipline"])
        question = Question.objects.create(discipline="Português", banca="Teste", year=2026, statement="Teste", options=["A", "B"], correct_answer=0)
        UserAnswer.objects.bulk_create([UserAnswer(user=self.user, question=question, selected_answer=0, is_correct=True) for _ in range(10)])
        response = self.client.get("/api/study-plan/")
        self.assertGreaterEqual(response.data["weekly_answers"], 10)
        self.assertEqual(StudyBlock.objects.get(pk=item.pk).status, "done")

    def test_replan_moves_overdue_block(self):
        self.client.post("/api/study-plan/", self.payload, format="json")
        item = StudyBlock.objects.first()
        item.date = timezone.localdate() - timedelta(days=2)
        item.save(update_fields=["date"])
        response = self.client.post("/api/study-plan/replan/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data["rescheduled"], 1)
        self.assertGreaterEqual(StudyBlock.objects.get(pk=item.pk).date, timezone.localdate())
