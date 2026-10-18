from unittest.mock import Mock, patch

import requests
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.billing.models import Plan, Subscription
from apps.chat.models import ChatUsage, Conversation, Message
from apps.chat.services import search_related_questions
from apps.questions.models import Question
from apps.workspace.models import SimulationRun


@override_settings(AI_PROVIDER="openrouter", OPENROUTER_API_KEY="test-key", OPENROUTER_MODEL="openrouter/free", OPENROUTER_ALLOW_PAID=False)
class GroundedAssistantTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("grounded")
        self.other = get_user_model().objects.create_user("other-grounded")
        self.client.force_authenticate(self.user)
        self.client.default_format = "json"
        Subscription.objects.create(user=self.user, plan=Plan.objects.get(slug="padrao"), status="active")
        self.conversation = Conversation.objects.create(user=self.user)
        self.question = Question.objects.create(discipline="Português", banca="FGV", year=2026,
            statement="Sobre concordância verbal", options=["Correta", "Incorreta"], correct_answer=0,
            explanation="Comentário sobre concordância", status="approved")
        self.hidden = Question.objects.create(discipline="Português", banca="FGV", year=2026,
            statement="Concordância privada", options=["A", "B"], correct_answer=1, status="pending")
        self.url = f"/api/conversations/{self.conversation.pk}/send/"

    @patch("apps.chat.services.requests.post")
    def test_openrouter_retrieves_visible_sources_and_records_actual_model(self, post):
        post.return_value = Mock(json=lambda: {"model": "example/tutor:free", "choices": [{"message": {"content": f"Veja [Q{self.question.pk}]"}}], "usage": {"prompt_tokens": 12, "completion_tokens": 7}})
        response = self.client.post(self.url, {"content": "Explique concordância"})
        self.assertEqual(response.status_code, 201)
        assistant = response.data["assistant_message"]
        self.assertEqual([q["id"] for q in assistant["sources"]], [self.question.pk])
        self.assertEqual(assistant["provider"], "openrouter")
        args = post.call_args
        self.assertEqual(args.args[0], "https://openrouter.ai/api/v1/chat/completions")
        payload = args.kwargs["json"]
        self.assertEqual(payload["model"], "openrouter/free")
        self.assertEqual(payload["provider"]["max_price"], {"prompt": 0, "completion": 0})
        self.assertIn(self.question.explanation, str(payload))
        self.assertNotIn(self.hidden.statement, str(payload))
        self.assertNotIn(self.user.username, str(payload))
        usage = ChatUsage.objects.get()
        self.assertEqual((usage.model, usage.input_tokens, usage.output_tokens), ("example/tutor:free", 12, 7))

    def test_search_handles_accents_no_matches_and_selection_visibility(self):
        self.assertEqual([q.pk for q in search_related_questions("Português")], [self.question.pk])
        self.assertEqual(search_related_questions("astronomia"), [])
        self.assertEqual(search_related_questions("", [self.hidden.pk]), [])

    @override_settings(OPENROUTER_MODEL="vendor/paid")
    @patch("apps.chat.services.requests.post")
    def test_paid_model_is_blocked_before_request(self, post):
        response = self.client.post(self.url, {"content": "Concordância"})
        self.assertEqual(response.status_code, 503)
        post.assert_not_called()
        self.assertFalse(ChatUsage.objects.exists())
        self.assertEqual(self.conversation.messages.count(), 1)

    @patch("apps.chat.services.requests.post", side_effect=requests.Timeout)
    def test_provider_failure_preserves_user_message_without_paid_fallback(self, post):
        response = self.client.post(self.url, {"content": "Concordância"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(post.call_count, 1)
        self.assertFalse(ChatUsage.objects.exists())

    @patch("apps.chat.services.requests.post")
    def test_empty_response_is_not_saved_as_success(self, post):
        post.return_value = Mock(json=lambda: {"choices": []})
        self.assertEqual(self.client.post(self.url, {"content": "Concordância"}).status_code, 503)
        self.assertFalse(ChatUsage.objects.exists())

    def test_material_and_practice_are_private_and_recheck_sources(self):
        message = Message.objects.create(conversation=self.conversation, role="assistant", content="Material",
                                         source_question_ids=[self.question.pk, self.hidden.pk])
        response = self.client.post("/api/study-materials/", {"title": "Concordância", "message_id": message.pk})
        self.assertEqual(response.status_code, 201)
        material_id = response.data["id"]
        self.assertEqual(self.client.post("/api/study-materials/", {"title": "Duplicado", "message_id": message.pk}).status_code, 400)
        practice_url = f"/api/conversations/{self.conversation.pk}/practice/"
        practice = self.client.post(practice_url, {"message_id": message.pk})
        self.assertEqual(practice.status_code, 201)
        self.assertEqual([q["id"] for q in practice.data["questions"]], [self.question.pk])
        self.assertNotIn("correct_answer", practice.data["questions"][0])
        run = SimulationRun.objects.get(pk=practice.data["simulation_id"])
        self.assertEqual(run.user, self.user)
        submitted = self.client.post("/api/questions/submit-simulation/", {
            "simulation_id": run.pk, "answers": [{"question_id": self.question.pk, "selected_answer": 0}]})
        self.assertEqual(submitted.status_code, 201)
        run.refresh_from_db()
        self.assertEqual((run.status, run.score, run.total), ("finished", 1, 1))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/study-materials/").data, [])
        self.assertEqual(self.client.post("/api/study-materials/", {"title": "Alheio", "message_id": message.pk}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/study-materials/{material_id}/").status_code, 404)
        self.assertEqual(self.client.post(practice_url, {"message_id": message.pk}).status_code, 404)
        self.client.force_authenticate(self.user)
        self.question.status = "rejected"
        self.question.save(update_fields=["status"])
        self.assertEqual(self.client.get("/api/study-materials/").data[0]["message"]["sources"], [])
        self.assertEqual(self.client.post(practice_url, {"message_id": message.pk}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/study-materials/{material_id}/").status_code, 204)
        self.assertTrue(Message.objects.filter(pk=message.pk).exists())

    def test_saved_material_survives_conversation_deletion(self):
        message = Message.objects.create(conversation=self.conversation, role="assistant", content="Resumo salvo",
                                         source_question_ids=[self.question.pk])
        self.assertEqual(self.client.post("/api/study-materials/", {"title": "Resumo", "message_id": message.pk}).status_code, 201)
        self.assertEqual(self.client.delete(f"/api/conversations/{self.conversation.pk}/").status_code, 204)
        saved = self.client.get("/api/study-materials/").data[0]
        self.assertEqual(saved["message"]["content"], "Resumo salvo")
        self.assertEqual(saved["message"]["sources"][0]["id"], self.question.pk)
