from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import override_settings
from rest_framework.test import APITestCase


class DiagnosticsAndRolesTests(APITestCase):
    def setUp(self):
        self.superuser = get_user_model().objects.create_user(
            username="diagnostics-super", password="safe-password", is_staff=True, is_superuser=True
        )
        self.client.force_authenticate(self.superuser)

    @override_settings(DIAGNOSTICS_ENABLED=True, DIAGNOSTICS_LOG_FILES=())
    def test_superuser_can_use_read_only_diagnostic_endpoints(self):
        for url in ("/api/backoffice/diagnostics/overview/", "/api/backoffice/diagnostics/services/", "/api/backoffice/diagnostics/database/", "/api/backoffice/diagnostics/logs/", "/api/backoffice/diagnostics/scripts/"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
        response = self.client.post("/api/backoffice/diagnostics/scripts/", {"script": "summary-counts"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mode"], "read_only")

    @override_settings(DIAGNOSTICS_ENABLED=True)
    def test_staff_cannot_access_diagnostics(self):
        staff = get_user_model().objects.create_user(username="diagnostics-staff", password="safe-password", is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get("/api/backoffice/diagnostics/overview/").status_code, 404)

    def test_only_superuser_manages_staff_roles(self):
        staff = get_user_model().objects.create_user(username="staff-manager", password="safe-password", is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get("/api/backoffice/staff/").status_code, 403)
        self.client.force_authenticate(self.superuser)
        Group.objects.get_or_create(name="Revisor")
        response = self.client.post("/api/backoffice/staff/", {"username": "new-reviewer", "password": "safe-password", "role": "reviewer"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["roles"], ["reviewer"])
