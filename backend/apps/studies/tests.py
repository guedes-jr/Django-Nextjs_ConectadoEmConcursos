from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.questions.models import Question, UserAnswer
from .models import StudyBlock, StudyInterval, StudyPlan, StudySession


class StudyPlanTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="estudante", password="safe-test-pass")
        self.other = get_user_model().objects.create_user(username="outro", password="safe-test-pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.trilha = {
            "kind": "trilha", "goal": "Técnico Judiciário", "disciplines": ["Português", "Direito"],
            "weekdays": list(range(7)), "minutes_per_day": 60,
        }
        self.cronograma = {
            "kind": "cronograma", "goal": "Técnico Judiciário", "disciplines": ["Português", "Direito"],
            "weekdays": [0, 1, 2], "minutes_per_day": 60,
            "schedule": [
                {"weekday": 0, "disciplines": ["Português"], "minutes": 60},
                {"weekday": 1, "disciplines": ["Direito"], "minutes": 60},
                {"weekday": 2, "disciplines": ["Português", "Direito"], "minutes": 120},
            ],
        }
        self.ciclo = {
            "kind": "ciclo", "goal": "Técnico Judiciário", "disciplines": ["Português", "Direito"],
            "weekdays": list(range(7)), "minutes_per_day": 60,
            "cycle": [
                {"discipline": "Português", "minutes": 30, "kind": "theory"},
                {"discipline": "Direito", "minutes": 30, "kind": "questions"},
            ],
        }

    def test_create_and_read_plan(self):
        response = self.client.post("/api/study-plans/", self.trilha, format="json")
        self.assertEqual(response.status_code, 201)
        plan_id = response.data["id"]
        self.assertEqual(StudyPlan.objects.count(), 1)
        self.assertGreater(len(response.data["blocks"]), 0)
        detail = self.client.get(f"/api/study-plans/{plan_id}/").data
        self.assertEqual(detail["goal"], "Técnico Judiciário")
        self.assertEqual(detail["kind"], "trilha")

    def test_multiple_plans_and_list(self):
        self.client.post("/api/study-plans/", self.trilha, format="json")
        second = {**self.ciclo, "goal": "Policial Civil"}
        self.assertEqual(self.client.post("/api/study-plans/", second, format="json").status_code, 201)
        plans = self.client.get("/api/study-plans/").data
        self.assertEqual(len(plans), 2)
        self.assertEqual({plan["kind"] for plan in plans}, {"trilha", "ciclo"})

    def test_invalid_input_and_private_plans(self):
        self.assertEqual(self.client.post("/api/study-plans/", {"goal": ""}, format="json").status_code, 400)
        self.client.post("/api/study-plans/", self.trilha, format="json")
        plan = StudyPlan.objects.get()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/study-plans/{plan.id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/study-plans/{plan.id}/").status_code, 404)

    def test_cronograma_generates_blocks_on_selected_weekdays(self):
        response = self.client.post("/api/study-plans/", self.cronograma, format="json")
        self.assertEqual(response.status_code, 201)
        items = StudyBlock.objects.filter(plan_id=response.data["id"])
        actual = sorted({item.date.weekday() for item in items})
        self.assertEqual(actual, [0, 1, 2])

    def test_ciclo_generates_blocks_following_cycle(self):
        response = self.client.post("/api/study-plans/", self.ciclo, format="json")
        self.assertEqual(response.status_code, 201)
        plan_id = response.data["id"]
        disciplines = list(StudyBlock.objects.filter(plan_id=plan_id).order_by("date", "position").values_list("discipline", flat=True))
        self.assertEqual(disciplines[0], "Português")
        self.assertEqual(disciplines[1], "Direito")
        self.assertEqual(disciplines[2], "Português")
        self.assertEqual(response.data["today_cycle"][0]["discipline"], "Português")

    def test_record_session_and_preserve_history_on_edit(self):
        response = self.client.post("/api/study-plans/", self.trilha, format="json")
        plan_id = response.data["id"]
        item = StudyBlock.objects.filter(plan_id=plan_id).first()
        response = self.client.post(f"/api/study-plans/{plan_id}/blocks/{item.id}/sessions/", {"minutes": 35}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["actual_minutes"], 35)
        patch = {**self.trilha, "minutes_per_day": 90}
        self.assertEqual(self.client.patch(f"/api/study-plans/{plan_id}/", patch, format="json").status_code, 200)
        self.assertTrue(StudySession.objects.filter(block=item, minutes=35).exists())

    def test_question_activity_updates_progress(self):
        response = self.client.post("/api/study-plans/", self.trilha, format="json")
        plan_id = response.data["id"]
        item = StudyBlock.objects.filter(plan_id=plan_id, kind="questions").first()
        item.date = timezone.localdate()
        item.discipline = "Português"
        item.save(update_fields=["date", "discipline"])
        question = Question.objects.create(discipline="Português", banca="Teste", year=2026, statement="Teste", options=["A", "B"], correct_answer=0)
        UserAnswer.objects.bulk_create([UserAnswer(user=self.user, question=question, selected_answer=0, is_correct=True) for _ in range(10)])
        response = self.client.get(f"/api/study-plans/{plan_id}/")
        self.assertGreaterEqual(response.data["weekly_answers"], 10)
        self.assertEqual(StudyBlock.objects.get(pk=item.pk).status, "done")

    def test_replan_moves_overdue_block(self):
        response = self.client.post("/api/study-plans/", self.trilha, format="json")
        plan_id = response.data["id"]
        item = StudyBlock.objects.filter(plan_id=plan_id).first()
        item.date = timezone.localdate() - timedelta(days=2)
        item.save(update_fields=["date"])
        response = self.client.post(f"/api/study-plans/{plan_id}/replan/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data["rescheduled"], 1)
        self.assertGreaterEqual(StudyBlock.objects.get(pk=item.pk).date, timezone.localdate())

    def test_delete_plan(self):
        response = self.client.post("/api/study-plans/", self.trilha, format="json")
        plan_id = response.data["id"]
        self.assertEqual(self.client.delete(f"/api/study-plans/{plan_id}/").status_code, 204)
        self.assertFalse(StudyPlan.objects.filter(id=plan_id).exists())

    def test_reminder_validation(self):
        payload = {**self.trilha, "reminder_enabled": True}
        self.assertEqual(self.client.post("/api/study-plans/", payload, format="json").status_code, 400)
        payload["reminder_time"] = "19:00"
        response = self.client.post("/api/study-plans/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["reminder_time"], "19:00")

    def test_alerts_aggregate_current_plan_work(self):
        self.client.post("/api/study-plans/", self.trilha, format="json")
        alerts = self.client.get("/api/study-alerts/").data
        self.assertIn("blocks_today", alerts)
        self.assertIn("reviews_due", alerts)
        self.assertIn("exam_in_days", alerts)
        self.assertGreaterEqual(alerts["blocks_today"], 0)
        self.assertEqual(alerts["plans"], 1)

    def test_intervals_create_and_list(self):
        self.client.post("/api/study-plans/", self.trilha, format="json")
        plan = StudyPlan.objects.get()
        response = self.client.post("/api/study-intervals/", {"plan_id": plan.id, "kind": "focus", "minutes": 25}, format="json")
        self.assertEqual(response.status_code, 201)
        self.client.post("/api/study-intervals/", {"kind": "break", "minutes": 5}, format="json")
        items = self.client.get("/api/study-intervals/").data
        self.assertEqual(len(items), 2)
        self.assertEqual(StudyInterval.objects.count(), 2)
        self.assertEqual(self.client.post("/api/study-intervals/", {"kind": "lunch", "minutes": 30}, format="json").status_code, 400)
