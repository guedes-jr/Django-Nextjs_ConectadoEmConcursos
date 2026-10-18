from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.concursos.models import NewsArticle
from apps.notifications.models import AdminNotification
from .models import AuditEvent


class ArticlesNoticesConsolidationTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user("editorial-admin",is_staff=True)
        self.user.groups.add(Group.objects.get(name="Administrador"))
        self.client=APIClient();self.client.force_authenticate(self.user)
        self.article_url="/api/backoffice/content/editorial/artigos/"

    def article(self,index,**kwargs):
        return NewsArticle.objects.create(source="manual",external_id=str(index),origin="manual",slug=f"article-{index}",title=f"Article {index}",body="Conteúdo",category="Estudos",**kwargs)

    def test_article_global_summary_filters_and_page(self):
        for index in range(4):self.article(index,editorial_status="draft",is_published=False,is_featured=index!=3)
        response=self.client.get(self.article_url,{"search":"Article","status":"draft","category":"Estudos","origin":"manual","featured":"1","page":2,"page_size":2,"ordering":"name"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data["count"],3)
        self.assertEqual(response.data["results"][0]["title"],"Article 2")
        self.assertEqual(response.data["overview"]["total"],4)
        self.assertEqual(self.client.get(self.article_url,{"ordering":"updated"}).status_code,200)

    def test_article_schedule_on_create_and_invalid_fields(self):
        future=(timezone.now()+timedelta(days=2)).isoformat()
        payload={"title":"Agendado","body":"Conteúdo","editorial_status":"scheduled","scheduled_for":future}
        response=self.client.post(self.article_url,payload,format="json")
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data["editorial_status"],"scheduled")
        self.assertFalse(response.data["is_published"])
        self.assertIsNotNone(response.data["scheduled_for"])
        for changes in ({"scheduled_for":(timezone.now()-timedelta(days=1)).isoformat()},{"body":""},{"tags":"invalid"},{"image_url":"invalid"}):
            self.assertEqual(self.client.post(self.article_url,{**payload,**changes},format="json").status_code,400)
        draft=self.client.post(self.article_url,{"title":"Rascunho","body":"Texto"},format="json")
        self.assertEqual(draft.data["editorial_status"],"draft")
        self.assertFalse(draft.data["is_published"])

    def test_article_edit_audit_and_bulk_are_consistent(self):
        item=self.article(1,editorial_status="scheduled",is_published=False,scheduled_for=timezone.now()+timedelta(days=2))
        response=self.client.patch(f"{self.article_url}{item.id}/",{"title":"Novo título"},format="json")
        self.assertEqual(response.status_code,200)
        event=AuditEvent.objects.get(action="article.updated",resource_id=str(item.id))
        self.assertEqual(event.before["title"],"Article 1")
        self.assertEqual(event.after["title"],"Novo título")
        rejected=self.client.post(f"{self.article_url}bulk/",{"ids":[item.id,999999],"action":"published"},format="json")
        self.assertEqual(rejected.status_code,404)
        item.refresh_from_db();self.assertFalse(item.is_published)
        response=self.client.post(f"{self.article_url}bulk/",{"ids":[item.id],"action":"draft"},format="json")
        self.assertEqual(response.status_code,200)
        item.refresh_from_db();self.assertIsNone(item.scheduled_for)

    def test_notice_global_summary_filters_sort_and_clamp(self):
        for index in range(4):AdminNotification.objects.create(title=f"Aviso {index}",summary="Busca por resumo",status="draft",priority="urgent",scope="all" if index!=3 else "selected_users")
        response=self.client.get("/api/backoffice/notifications/",{"search":"resumo","scope":"all-users","priority":"urgent","status":"draft","ordering":"name","page":2,"page_size":2})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data["count"],3)
        self.assertEqual(response.data["results"][0]["title"],"Aviso 2")
        self.assertEqual(response.data["overview"]["total"],4)
        self.assertEqual(response.data["limit"],2)
        response=self.client.get("/api/backoffice/notifications/",{"page":99,"page_size":2})
        self.assertEqual(response.data["page"],2)

    def test_readonly_roles_do_not_receive_write_permissions(self):
        reviewer=get_user_model().objects.create_user("readonly-reviewer",is_staff=True)
        reviewer.groups.add(Group.objects.get(name="Revisor"))
        self.client.force_authenticate(reviewer)
        self.assertFalse(self.client.get(self.article_url).data["can_manage"])
        permissions=self.client.get("/api/backoffice/notifications/").data["permissions"]
        self.assertFalse(any(permissions.values()))
        self.assertEqual(self.client.post(self.article_url,{},format="json").status_code,403)
