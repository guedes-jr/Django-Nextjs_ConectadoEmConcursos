from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.questions.models import Question, Exam


class QuestionWorkbenchTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user("workbench-admin",is_staff=True)
        self.user.groups.add(Group.objects.get(name="Administrador"))
        self.client=APIClient();self.client.force_authenticate(self.user)
        self.url="/api/backoffice/content/questions/manual/"
        self.queue="/api/backoffice/content/questions/queue/"

    def question(self,index,status="pending"):
        return Question.objects.create(statement=f"Questão de revisão {index}",banca="FGV",discipline="Português",year=2026,options=["Alternativa A","Alternativa B"],correct_answer=0,status=status)

    def test_catalog_filters_pagination_summary_and_capabilities(self):
        for index in range(4):self.question(index,"draft")
        response=self.client.get(self.url,{"status":"draft","search":"revisão","year":2026,"page":2,"page_size":2,"ordering":"oldest"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data["count"],4)
        self.assertEqual(len(response.data["results"]),2)
        self.assertEqual(response.data["overview"]["draft"],4)
        self.assertTrue(response.data["permissions"]["can_review"])
        self.assertEqual(self.client.get(self.url,{"year":"bad"}).status_code,400)

    def test_queue_direct_id_filters_and_out_of_range_page(self):
        first=self.question(1,"approved");self.question(2)
        response=self.client.get(self.queue,{"question_id":first.id,"status":""})
        self.assertEqual([row["id"] for row in response.data["results"]],[first.id])
        self.assertEqual(response.data["overview"]["total"],2)
        self.assertEqual(response.data["review_policy"]["min_explanation_chars"],120)
        self.assertEqual(self.client.get(self.queue,{"year":"bad"}).status_code,400)
        response=self.client.get(self.queue,{"banca":"FGV","discipline":"Português","year":2026,"offset":99,"limit":12})
        self.assertEqual(response.data["offset"],0)
        self.assertEqual(response.data["total"],1)

    def test_review_note_restores_and_rejects_stale_writes(self):
        question=self.question(1)
        timestamp=question.updated_at.isoformat()
        url="/api/backoffice/content/questions/draft/"
        response=self.client.post(url,{"id":question.id,"note":"Comentário preservado","updated_at":timestamp},format="json")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data["results"][0]["review_note"],"Comentário preservado")
        response=self.client.post(url,{"id":question.id,"note":"Versão antiga","updated_at":timestamp},format="json")
        self.assertEqual(response.status_code,409)
        question.refresh_from_db();self.assertEqual(question.review_note,"Comentário preservado")
        question.status="approved";question.save()
        self.assertEqual(self.client.post(url,{"id":question.id,"note":"Alterar após revisão"},format="json").status_code,409)

    def test_manual_edit_stale_invalid_year_and_link(self):
        data={"statement":"Questão manual completa","banca":"FGV","discipline":"Português","year":2026,"options":["A","B"],"correct_answer":0}
        response=self.client.post(self.url,data,format="json");self.assertEqual(response.status_code,201)
        item=response.data
        Question.objects.filter(pk=item["id"]).update(updated_at=timezone.now()+timedelta(seconds=1))
        response=self.client.patch(f"{self.url}{item['id']}/",{**data,"updated_at":item["updated_at"]},format="json")
        self.assertEqual(response.status_code,409)
        for patch in ({"year":"invalid"},{"exam":999999}):
            self.assertEqual(self.client.post(self.url,{**data,**patch},format="json").status_code,400)

    def test_editor_can_edit_but_cannot_review(self):
        editor=get_user_model().objects.create_user("workbench-editor",is_staff=True)
        editor.groups.add(Group.objects.get(name="Editor"));self.client.force_authenticate(editor)
        permissions=self.client.get(self.url).data["permissions"]
        self.assertTrue(permissions["can_edit"]);self.assertFalse(permissions["can_review"])
        self.assertFalse(self.client.get(self.queue).data["can_review"])

    def test_exam_options_preserve_links_beyond_first_page(self):
        Exam.objects.bulk_create([Exam(title=f"Prova {index}",banca="FGV",year=2026) for index in range(201)])
        response=self.client.get("/api/backoffice/content/editorial/provas/?options=1")
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.data["results"]),201)
        self.assertEqual(set(response.data["results"][0]),{"id","title","banca","year"})
