from io import StringIO
from smtplib import SMTPException
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, SimpleTestCase, override_settings
from rest_framework.test import APIClient

from .deployment_checks import deployment_storage_email_checks, email_transport_checks


class DeploymentChecksTests(SimpleTestCase):
    @override_settings(EMAIL_USE_SSL=True, EMAIL_USE_TLS=True, EMAIL_TIMEOUT=0)
    def test_invalid_transport_options_are_errors(self):
        self.assertEqual({issue.id for issue in email_transport_checks(None)}, {"core.E001", "core.E002"})

    @override_settings(MEDIA_ROOT="/srv/public", BACKUP_DIR="/srv/public/backups", OFFICIAL_EXAMS_ROOT="/srv/public/exams")
    def test_public_media_must_not_expose_backups_or_private_exams(self):
        ids = {issue.id for issue in deployment_storage_email_checks(None)}
        self.assertTrue({"core.E003", "core.E004"}.issubset(ids))

    @override_settings(MEDIA_ROOT="/srv/media", BACKUP_DIR="/srv/backups", OFFICIAL_EXAMS_ROOT="/srv/private",
                       EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="smtp.example.com",
                       EMAIL_USE_TLS=True, EMAIL_USE_SSL=False, DEFAULT_FROM_EMAIL="no-reply@example.com", FRONTEND_URL="https://example.com")
    def test_persistent_paths_and_configured_smtp_pass_static_checks_without_network(self):
        with patch("smtplib.SMTP", side_effect=AssertionError("No network allowed")):
            self.assertEqual(deployment_storage_email_checks(None), [])


class DeliveryCommandTests(TestCase):
    def test_default_command_does_not_connect_to_smtp_or_send(self):
        with patch("apps.core.management.commands.check_email_delivery.get_connection") as connection, patch("apps.core.management.commands.check_email_delivery.send_mail") as send:
            output = StringIO()
            call_command("check_email_delivery", stdout=output)
            connection.assert_not_called(); send.assert_not_called()
            self.assertIn("Nenhuma conexão", output.getvalue())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    def test_console_does_not_count_as_delivery(self):
        with self.assertRaises(CommandError):
            call_command("check_email_delivery", send_to="test@example.com", stdout=StringIO())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend")
    def test_smtp_probe_only_opens_connection_and_explicit_send_checks_acceptance(self):
        with patch("apps.core.management.commands.check_email_delivery.get_connection") as connection, patch("apps.core.management.commands.check_email_delivery.send_mail", return_value=1) as send:
            call_command("check_email_delivery", smtp_connect=True, stdout=StringIO())
            connection.assert_called_once(); send.assert_not_called()
            call_command("check_email_delivery", send_to="test@example.com", stdout=StringIO())
            send.assert_called_once()
        with patch("apps.core.management.commands.check_email_delivery.send_mail", side_effect=SMTPException("secret-password")):
            with self.assertRaises(CommandError) as failure:
                call_command("check_email_delivery", send_to="test@example.com", stdout=StringIO())
            self.assertNotIn("secret-password", str(failure.exception))


class PasswordResetDeliveryTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("mail-user", email="mail@example.com", password="original-password")
        self.client = APIClient()

    def test_transport_failure_returns_generic_response_and_logs_no_address_or_token(self):
        with patch("apps.core.api.send_mail", side_effect=SMTPException("mail@example.com token=private")), self.assertLogs("apps.core.api", level="ERROR") as logs:
            response = self.client.post("/api/password/reset/", {"email": self.user.email})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("mail@example.com", str(logs.output))
        self.assertNotIn("private", str(logs.output))
        unknown = self.client.post("/api/password/reset/", {"email": "unknown@example.com"})
        self.assertEqual(response.data, unknown.data)

    def test_blank_invalid_and_inactive_emails_do_not_send(self):
        self.user.is_active = False
        self.user.save()
        with patch("apps.core.api.send_mail") as send:
            for email in ["", "invalid", self.user.email]:
                self.assertEqual(self.client.post("/api/password/reset/", {"email": email}).status_code, 200)
            send.assert_not_called()
