from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.questions.models import Question, SupportText
from apps.questions.serializers import QuestionSerializer


class SupportTextTests(TestCase):
    url = "/api/backoffice/content/support-texts/"

    def setUp(self):
        self.editor = get_user_model().objects.create_user("text-editor", is_staff=True)
        self.editor.groups.add(Group.objects.get(name="Editor"))
        self.client = APIClient()
        self.client.force_authenticate(self.editor)
        self.text = SupportText.objects.create(title="Crônica", content="<p>Texto para interpretação.</p>", reference="Autor, 2026")
        self.question = Question.objects.create(statement="Qual o sentido?", banca="FCC", discipline="Português", year=2026,
                                                options=["A", "B"], correct_answer=0, status="approved")

    def link(self, value, **kwargs):
        self.question.refresh_from_db()
        return self.client.patch(f"/api/backoffice/content/questions/{self.question.id}/support-text/",
                                 {"support_text_id": value, "updated_at": self.question.updated_at.isoformat().replace("+00:00", "Z"), **kwargs}, format="json")

    def test_shared_text_and_public_serialization_preserve_status_and_answers(self):
        self.assertEqual(self.link(self.text.id).status_code, 200)
        self.question.refresh_from_db()
        other = Question.objects.create(statement="Outro enunciado", banca="FCC", discipline="Português", year=2026,
                                        options=["A", "B"], correct_answer=1, support_text=self.text)
        self.assertEqual(self.text.questions.count(), 2)
        payload = QuestionSerializer(self.question).data
        self.assertEqual(payload["support_text"]["content"], self.text.content)
        self.assertNotIn("correct_answer", payload)
        self.assertEqual(self.question.status, "approved")
        self.assertEqual(self.question.correct_answer, 0)
        self.assertEqual(self.client.get(self.url).data["results"][0]["question_count"], 2)
        self.assertEqual(QuestionSerializer(other).data["support_text"]["id"], self.text.id)
        self.assertEqual(self.link(None).status_code, 200)
        self.question.refresh_from_db()
        self.assertIsNone(QuestionSerializer(self.question).data["support_text"])

    def test_delete_linked_text_is_blocked_and_edit_propagates(self):
        self.link(self.text.id)
        url = f"{self.url}{self.text.id}/"
        version = self.text.updated_at.isoformat()
        self.assertEqual(self.client.delete(url, {"updated_at": version}, format="json").status_code, 409)
        response = self.client.patch(url, {"content": "Novo texto", "updated_at": version}, format="json")
        self.assertEqual(response.status_code, 200)
        self.question.refresh_from_db()
        self.assertEqual(QuestionSerializer(self.question).data["support_text"]["content"], "Novo texto")
        self.assertEqual(self.client.patch(url, {"title": "Obsoleto", "updated_at": version}, format="json").status_code, 409)

    def test_invalid_ids_empty_content_and_stale_links(self):
        for value in [True, "1", 999999, 1.5]:
            self.assertEqual(self.link(value).status_code, 400)
        self.assertEqual(self.link(self.text.id, updated_at="old").status_code, 409)
        for content in ["", "<p><br></p>", "<p>&nbsp;</p>"]:
            self.assertEqual(self.client.post(self.url, {"title": "Vazio", "content": content}, format="json").status_code, 400)

    def test_permissions_and_pagination(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        reviewer = get_user_model().objects.create_user("text-reviewer", is_staff=True)
        reviewer.groups.add(Group.objects.get(name="Revisor"))
        self.client.force_authenticate(reviewer)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.post(self.url, {"title": "X", "content": "Y"}, format="json").status_code, 403)
        self.assertEqual(self.link(self.text.id).status_code, 403)
        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.get(self.url, {"search": "Crônica"}).data["count"], 1)
        self.assertEqual(self.client.get(self.url, {"usage": "linked"}).data["count"], 0)
        self.assertEqual(self.client.get(self.url, {"page": "bad"}).status_code, 400)

    def test_manual_create_link_and_delete_unused(self):
        payload = {"statement": "Enunciado independente", "banca": "FCC", "discipline": "Português", "year": 2026,
                   "options": ["A", "B"], "correct_answer": 1, "support_text_id": self.text.id}
        response = self.client.post("/api/backoffice/content/questions/manual/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["support_text"]["title"], "Crônica")
        payload["support_text_id"] = 999999
        payload["statement"] = "Novo enunciado"
        self.assertEqual(self.client.post("/api/backoffice/content/questions/manual/", payload, format="json").status_code, 400)
        unused = SupportText.objects.create(title="Sem uso", content="Conteúdo")
        self.assertEqual(self.client.delete(f"{self.url}{unused.id}/", {"updated_at": unused.updated_at.isoformat()}, format="json").status_code, 204)

    def test_simulation_and_tutor_include_support_text_without_exposing_answer_to_student(self):
        from apps.chat.services import build_study_context, search_related_questions
        self.link(self.text.id)
        response = self.client.post("/api/questions/simulations/start/", {"discipline": "Português", "count": 1}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        item = response.data["questions"][0]
        self.assertEqual(item["support_text"]["id"], self.text.id)
        self.assertNotIn("correct_answer", item)
        self.assertIn(self.text.content, build_study_context([self.question.pk]))
        self.assertIn(self.question.pk, [q.pk for q in search_related_questions("interpretação")])

    def test_same_statement_with_distinct_support_text_is_allowed(self):
        payload = {"statement": "Leia e responda", "banca": "FCC", "discipline": "Português", "year": 2026,
                   "options": ["A", "B"], "correct_answer": 0, "support_text_id": self.text.id}
        url = "/api/backoffice/content/questions/manual/"
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 201)
        other = SupportText.objects.create(title="Outro texto", content="Outra interpretação")
        payload["support_text_id"] = other.pk
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 201)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
