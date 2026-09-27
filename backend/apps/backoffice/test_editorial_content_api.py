from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.concursos.models import Concurso


class EditorialContentApiTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user("editor", password="safe", is_staff=True)
        self.client = APIClient(); self.client.force_authenticate(user)

    def test_manual_concurso_and_linked_exam(self):
        concurso = self.client.post("/api/backoffice/content/editorial/concursos/", {"title": "TJ Teste", "organization": "TJ"}, format="json")
        self.assertEqual(concurso.status_code, 201)
        self.assertEqual(concurso.data["origin"], "manual")
        prova = self.client.post("/api/backoffice/content/editorial/provas/", {"title": "Analista", "banca": "FGV", "year": 2026, "concurso": concurso.data["id"]}, format="json")
        self.assertEqual(prova.status_code, 201)
        self.assertEqual(prova.data["concurso"], concurso.data["id"])

    def test_imported_concurso_only_allows_editorial_status(self):
        item = Concurso.objects.create(source="pci", external_id="x", title="Importado")
        blocked = self.client.patch(f"/api/backoffice/content/editorial/concursos/{item.id}/", {"title": "Não pode"}, format="json")
        self.assertEqual(blocked.status_code, 409)
        allowed = self.client.patch(f"/api/backoffice/content/editorial/concursos/{item.id}/", {"editorial_status": "archived"}, format="json")
        self.assertEqual(allowed.status_code, 200)
        item.refresh_from_db(); self.assertEqual(item.editorial_status, "archived")
