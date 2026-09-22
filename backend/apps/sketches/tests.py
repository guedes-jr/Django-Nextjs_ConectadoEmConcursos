from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.sketches.models import Sketch


class SketchAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("sketch-user", password="password")
        self.other_user = get_user_model().objects.create_user("other-sketch-user", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_crud_is_scoped_to_authenticated_user(self):
        own = Sketch.objects.create(user=self.user, title="Meu", data={"elements": []})
        other = Sketch.objects.create(user=self.other_user, title="Outro", data={})

        response = self.client.get("/api/sketches/")
        self.assertEqual([item["id"] for item in response.data], [own.id])
        self.assertEqual(self.client.get(f"/api/sketches/{other.id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/sketches/{other.id}/").status_code, 404)

    def test_recent_returns_only_last_ten(self):
        for index in range(12):
            Sketch.objects.create(user=self.user, title=f"Rascunho {index}", data={})

        response = self.client.get("/api/sketches/recent/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 10)
        self.assertEqual(response.data[0]["title"], "Rascunho 11")

    def test_title_is_normalized_and_data_must_be_an_object(self):
        response = self.client.post(
            "/api/sketches/", {"title": "   ", "data": {}}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["title"], "Rascunho")

        invalid = self.client.post(
            "/api/sketches/", {"title": "Inválido", "data": []}, format="json"
        )
        self.assertEqual(invalid.status_code, 400)
