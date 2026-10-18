from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from apps.concursos.models import Concurso
from apps.questions.models import Exam
from .models import AuditEvent


class ConcursosProvasConsolidationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("catalog-editor", is_staff=True)
        self.user.groups.add(Group.objects.get(name="Editor"))
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def concurso(self, index, **changes):
        return Concurso.objects.create(title=f"Concurso {index}", source="manual", external_id=f"manual-{index}", origin="manual", **changes)

    def test_concurso_filters_and_global_summary(self):
        for index in range(4): self.concurso(index, state="SE", status="open", editorial_status="archived" if index == 3 else "published")
        response = self.client.get("/api/backoffice/content/editorial/concursos/", {"origin":"manual", "status":"open", "state":"se", "editorial_status":"published", "page":2, "page_size":2, "ordering":"name"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(response.data["results"][0]["title"], "Concurso 2")
        self.assertEqual(response.data["overview"]["total"], 4)
        self.assertEqual(response.data["overview"]["archived"], 1)
        self.assertTrue(response.data["can_manage"])
        self.assertEqual(self.client.get("/api/backoffice/content/editorial/concursos/", {"page":"bad"}).status_code, 400)

    def test_options_are_not_limited_to_first_200(self):
        Concurso.objects.bulk_create([Concurso(title=f"Concurso {index}",source="manual",external_id=str(index)) for index in range(201)])
        response = self.client.get("/api/backoffice/content/editorial/concursos/?options=1")
        self.assertEqual(len(response.data["results"]), 201)
        self.assertEqual(set(response.data["results"][0]), {"id", "title"})

    def test_manual_validation_and_imported_protection_with_correct_audit(self):
        url = "/api/backoffice/content/editorial/concursos/"
        self.assertEqual(self.client.post(url, {"title":"Invalid", "status":"bad"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"title":"Invalid", "source_url":"invalid"}, format="json").status_code, 400)
        item = Concurso.objects.create(title="Importado",source="pci",external_id="test")
        self.assertEqual(self.client.patch(f"{url}{item.id}/", {"title":"Changed"},format="json").status_code,409)
        self.assertEqual(self.client.patch(f"{url}{item.id}/", {"editorial_status":"archived"},format="json").status_code,200)
        audit = AuditEvent.objects.get(action="concurso.updated",resource_id=str(item.id))
        self.assertEqual(audit.before["editorial_status"], "published")
        self.assertEqual(audit.after["editorial_status"], "archived")

    def test_exam_year_level_state_link_validation_and_audit(self):
        url = "/api/backoffice/content/editorial/provas/"
        concurso = self.concurso(1)
        response = self.client.post(url, {"title":"Prova A", "banca":"FGV", "year":2025, "level":"Superior", "state":"se", "concurso":concurso.id},format="json")
        self.assertEqual(response.status_code,201)
        self.assertFalse(response.data["is_published"])
        item_id = response.data["id"]
        self.assertEqual(response.data["level"],"Superior")
        self.assertEqual(response.data["state"],"SE")
        self.assertEqual(response.data["concurso_title"],concurso.title)
        response = self.client.patch(f"{url}{item_id}/", {"year":2026, "state":"ce"},format="json")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data["year"],2026)
        audit = AuditEvent.objects.get(action="exam.updated",resource_id=str(item_id))
        self.assertEqual(audit.before["year"],2025)
        self.assertEqual(audit.after["year"],2026)
        for payload in ({"year":"bad"},{"year":2101},{"concurso":999999},{"title":""},{"state":"SER"}):
            self.assertEqual(self.client.patch(f"{url}{item_id}/",payload,format="json").status_code,400)
        self.assertEqual(self.client.post(url,{"title":"Prova A","banca":"FGV","year":2026},format="json").status_code,400)

    def test_exam_filters_pagination_and_readonly_staff(self):
        concurso = self.concurso(1)
        for index in range(4): Exam.objects.create(title=f"Exam {index}",banca="FGV",year=2026,concurso=concurso,is_published=index != 3)
        url = "/api/backoffice/content/editorial/provas/"
        response = self.client.get(url,{"published":"1","linked":"1","concurso":concurso.id,"year":2026,"search":"FGV","page":2,"page_size":2,"ordering":"name"})
        self.assertEqual(response.data["count"],3)
        self.assertEqual(response.data["results"][0]["title"],"Exam 2")
        self.assertEqual(response.data["overview"]["draft"],1)
        self.assertEqual(self.client.get(url,{"year":"bad"}).status_code,400)
        reviewer = get_user_model().objects.create_user("review-only",is_staff=True)
        reviewer.groups.add(Group.objects.get(name="Revisor"))
        self.client.force_authenticate(reviewer)
        self.assertFalse(self.client.get(url).data["can_manage"])
        self.assertEqual(self.client.post(url,{},format="json").status_code,403)
        self.assertFalse(self.client.get("/api/backoffice/content/editorial/concursos/").data["can_manage"])
