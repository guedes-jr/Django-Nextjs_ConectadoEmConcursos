from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from apps.questions.models import BancaCatalog

User = get_user_model()


class StaffBancasConsolidationTests(TestCase):
    def setUp(self):
        self.root = User.objects.create_user("catalog-root", is_staff=True, is_superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(self.root)

    def test_staff_filter_summary_pagination_and_permissions(self):
        for index in range(3):
            user = User.objects.create_user(f"editor-{index}", is_staff=True, is_active=index != 2)
            user.groups.add(Group.objects.get(name="Editor"))
        response = self.client.get("/api/backoffice/staff/", {"role": "editor", "status": "active", "page": 2, "page_size": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["results"][0]["username"], "editor-1")
        self.assertEqual(response.data["overview"]["total"], 4)
        self.assertEqual(response.data["overview"]["editor"], 3)
        self.assertEqual(response.data["overview"]["superuser"], 1)
        self.assertEqual(self.client.get("/api/backoffice/staff/", {"page": "bad"}).status_code, 400)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/backoffice/staff/").status_code, 403)

    def test_staff_creation_validation_and_self_protection(self):
        self.assertEqual(self.client.post("/api/backoffice/staff/", {"username": "weak", "password": "123", "role": "editor"}, format="json").status_code, 400)
        self.assertFalse(User.objects.filter(username="weak").exists())
        url = f"/api/backoffice/staff/{self.root.id}/"
        self.assertEqual(self.client.patch(url, {"is_active": False}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"is_staff": False}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"is_staff": True, "is_active": True, "first_name": "Root"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(url, {"is_active": "false"}, format="json").status_code, 400)

    def test_bancas_combined_filters_pagination_and_alias_search(self):
        for index in range(3):
            response = self.client.post("/api/backoffice/content/bancas/", {"name": f"Catálogo {index}", "slug": f"catalogo-{index}", "alias": f"SIGLA {index}", "is_featured": True}, format="json")
            self.assertEqual(response.status_code, 201)
            self.assertEqual(len(response.data["aliases"]), 1)
        response = self.client.get("/api/backoffice/content/bancas/", {"search": "SIGLA", "featured": "1", "active": "1", "page": 2, "page_size": 2})
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["overview"]["total"], 3)
        self.assertTrue(response.data["can_manage"])
        self.assertEqual(self.client.get("/api/backoffice/content/bancas/", {"page": "bad"}).status_code, 400)

    def test_alias_collision_rolls_back_create_and_edit(self):
        first = BancaCatalog.objects.create(name="Primeira", slug="primeira")
        response = self.client.post("/api/backoffice/content/bancas/", {"name": "Segunda", "slug": "segunda", "alias": first.name}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(BancaCatalog.objects.filter(slug="segunda").exists())
        second = BancaCatalog.objects.create(name="Segunda", slug="segunda")
        url = f"/api/backoffice/content/bancas/{second.id}/"
        response = self.client.patch(url, {"description": "Não deve persistir", "alias": first.name}, format="json")
        self.assertEqual(response.status_code, 400)
        second.refresh_from_db()
        self.assertEqual(second.description, "")
        response = self.client.patch(url, {"alias": "Nova sigla"}, format="json")
        self.assertEqual(response.data["aliases"][0]["alias"], "Nova sigla")

    def test_reviewer_can_only_read_catalog(self):
        reviewer = User.objects.create_user("reviewer-only", is_staff=True)
        reviewer.groups.add(Group.objects.get(name="Revisor"))
        self.client.force_authenticate(reviewer)
        self.assertFalse(self.client.get("/api/backoffice/content/bancas/").data["can_manage"])
        self.assertEqual(self.client.post("/api/backoffice/content/bancas/", {"name": "Negada"}, format="json").status_code, 403)
