from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.questions.models import BancaAlias, BancaCatalog
from apps.questions.naming import banca_variants, normalize_banca


class BancaCatalogApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "catalog-admin", password="safe-password", is_staff=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_staff_can_create_catalog_and_alias_normalizes_to_canonical_name(self):
        created = self.client.post(
            "/api/backoffice/content/bancas/",
            {"name": "Fundação Getulio Vargas", "slug": "fgv", "is_featured": True},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["name"], "Fundação Getulio Vargas")
        self.assertEqual(created.data["created_by"], "catalog-admin")

        alias = self.client.post(
            f"/api/backoffice/content/bancas/{created.data['id']}/aliases/",
            {"alias": "FGV"},
            format="json",
        )
        self.assertEqual(alias.status_code, 201)
        self.assertEqual(normalize_banca("fgv"), "Fundação Getulio Vargas")
        self.assertIn("FGV", banca_variants("fgv"))

    def test_alias_cannot_collide_with_canonical_name(self):
        first = BancaCatalog.objects.create(name="CEBRASPE", slug="cebraspe")
        response = self.client.post(
            "/api/backoffice/content/bancas/",
            {"name": "Outra banca", "slug": "outra"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        collision = self.client.post(
            f"/api/backoffice/content/bancas/{response.data['id']}/aliases/",
            {"alias": first.name},
            format="json",
        )
        self.assertEqual(collision.status_code, 400)
        self.assertIn("alias", collision.data)

    def test_list_can_filter_active_catalog_entries(self):
        active = BancaCatalog.objects.create(name="Ativa", slug="ativa")
        BancaCatalog.objects.create(name="Inativa", slug="inativa", is_active=False)
        response = self.client.get("/api/backoffice/content/bancas/?active=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["results"]], [active.id])

    def test_non_staff_is_forbidden(self):
        client = APIClient()
        user = get_user_model().objects.create_user("student", password="safe-password")
        client.force_authenticate(user)
        response = client.get("/api/backoffice/content/bancas/")
        self.assertEqual(response.status_code, 403)


class BancaCatalogModelTests(TestCase):
    def test_alias_repeating_own_canonical_name_is_refused(self):
        banca = BancaCatalog.objects.create(name="CEBRASPE", slug="cebraspe")
        with self.assertRaises(ValidationError):
            BancaAlias.objects.create(banca=banca, alias="cebraspe")
