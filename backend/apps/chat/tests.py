from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.chat.models import ChatUsage, Conversation
from apps.billing.models import Plan, Subscription
from apps.questions.models import Question


class ChatAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("chat-user", password="password")
        self.other_user = get_user_model().objects.create_user("other-chat-user", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @override_settings(OPENAI_API_KEY="")
    def test_create_conversation_and_send_with_local_assistant(self):
        created = self.client.post("/api/conversations/", {}, format="json")
        self.assertEqual(created.status_code, 201)

        response = self.client.post(
            f"/api/conversations/{created.data['id']}/send/",
            {"content": "Faça um resumo das minhas estatísticas"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["assistant_message"]["provider"], "local")
        self.assertIn("0 tentativas", response.data["assistant_message"]["content"])
        conversation = Conversation.objects.get(pk=created.data["id"])
        self.assertEqual(conversation.messages.count(), 2)
        self.assertEqual(ChatUsage.objects.filter(user=self.user, provider="local").count(), 1)
        self.assertEqual(conversation.title, "Faça um resumo das minhas estatísticas")

    def test_conversations_are_scoped_to_the_authenticated_user(self):
        own = Conversation.objects.create(user=self.user, title="Minha conversa")
        other = Conversation.objects.create(user=self.other_user, title="Conversa alheia")

        response = self.client.get("/api/conversations/")

        self.assertEqual([item["id"] for item in response.data], [own.id])
        self.assertEqual(self.client.get(f"/api/conversations/{other.id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/conversations/{other.id}/").status_code, 404)

    @override_settings(
        OPENAI_API_KEY="test-key",
        OPENAI_MODEL="gpt-test",
        OPENAI_API_URL="https://api.openai.com/v1/responses",
    )
    @patch("apps.chat.services.requests.post")
    def test_openai_request_does_not_store_response(self, mocked_post):
        Subscription.objects.create(
            user=self.user,
            plan=Plan.objects.get(slug="padrao"),
            status=Subscription.Status.ACTIVE,
        )
        provider_response = Mock()
        provider_response.raise_for_status.return_value = None
        provider_response.json.return_value = {
            "output": [{"type": "message", "content": [{"type": "output_text", "text": "Resposta útil"}]}]
        }
        mocked_post.return_value = provider_response
        conversation = Conversation.objects.create(user=self.user)

        response = self.client.post(
            f"/api/conversations/{conversation.id}/send/",
            {"content": "Explique esta questão"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["assistant_message"]["content"], "Resposta útil")
        payload = mocked_post.call_args.kwargs["json"]
        self.assertFalse(payload["store"])
        self.assertNotEqual(payload["safety_identifier"], str(self.user.pk))
        self.assertEqual(len(payload["safety_identifier"]), 40)

    @override_settings(OPENAI_API_KEY="")
    def test_free_plan_daily_chat_limit_is_enforced(self):
        conversation = Conversation.objects.create(user=self.user)
        for _ in range(5):
            ChatUsage.objects.create(user=self.user, conversation=conversation, provider="local")
        response = self.client.post(
            f"/api/conversations/{conversation.id}/send/", {"content": "Olá"}, format="json"
        )
        self.assertEqual(response.status_code, 429)

    def test_advanced_context_is_rejected_for_free_plan(self):
        question = Question.objects.create(
            discipline="Português", banca="FGV", year=2026, statement="Texto", options=["A", "B"], correct_answer=0
        )
        conversation = Conversation.objects.create(user=self.user)
        response = self.client.post(
            f"/api/conversations/{conversation.id}/send/",
            {"content": "Explique", "question_ids": [question.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(conversation.messages.count(), 0)

    def test_message_content_is_required_and_limited(self):
        conversation = Conversation.objects.create(user=self.user)
        empty = self.client.post(
            f"/api/conversations/{conversation.id}/send/", {"content": ""}, format="json"
        )
        too_long = self.client.post(
            f"/api/conversations/{conversation.id}/send/", {"content": "x" * 8001}, format="json"
        )
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(too_long.status_code, 400)
