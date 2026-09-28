from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .audit import log
from .models import AuditEvent


class AuditEventTests(APITestCase):
    def test_redacts_sensitive_data_and_is_immutable(self):
        user = get_user_model().objects.create_user(username="audit-user", password="secret")
        request = type("Request", (), {"user": user, "headers": {}, "META": {"REMOTE_ADDR": "127.0.0.1"}})()
        event = log(request, action="test", resource_type="notification", resource_id=1, after={"token": "secret", "title": "ok"})
        self.assertEqual(event.after["token"], "[redigido]")
        self.assertEqual(event.after["title"], "ok")
        event.action = "changed"
        with self.assertRaises(RuntimeError):
            event.save()
        self.assertEqual(AuditEvent.objects.count(), 1)

    def test_staff_can_filter_audit_events(self):
        user = get_user_model().objects.create_user(username="audit-staff", password="secret", is_staff=True)
        event = AuditEvent.objects.create(actor=user, action="notification.published", resource_type="admin_notification", resource_id="12")
        self.client.force_authenticate(user)
        response = self.client.get("/api/backoffice/audit/?resource_type=admin_notification")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["results"][0]["id"], event.id)

    def test_staff_can_read_business_report(self):
        user = get_user_model().objects.create_user(username="report-staff", password="secret", is_staff=True)
        self.client.force_authenticate(user)
        response = self.client.get("/api/backoffice/reports/business/?days=30")
        self.assertEqual(response.status_code, 200)
        self.assertIn("financial", response.data)

    def test_audit_export_is_limited_and_audited(self):
        user = get_user_model().objects.create_user(username="export-staff", password="secret", is_staff=True)
        AuditEvent.objects.create(actor=user, action="notification.published", resource_type="admin_notification", resource_id="13")
        self.client.force_authenticate(user)
        response = self.client.get("/api/backoffice/audit/?export=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertTrue(AuditEvent.objects.filter(action="audit.exported").exists())

    def test_financial_metrics_are_restricted_to_authorized_administrators(self):
        staff = get_user_model().objects.create_user(username="limited-report", password="secret", is_staff=True)
        self.client.force_authenticate(staff)
        response = self.client.get("/api/backoffice/reports/business/?days=30")
        self.assertFalse(response.data["financial"]["access_granted"])
        admin = get_user_model().objects.create_user(username="financial-admin", password="secret", is_staff=True, is_superuser=True)
        self.client.force_authenticate(admin)
        response = self.client.get("/api/backoffice/reports/business/?days=30&export=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertTrue(AuditEvent.objects.filter(action="report.exported").exists())
