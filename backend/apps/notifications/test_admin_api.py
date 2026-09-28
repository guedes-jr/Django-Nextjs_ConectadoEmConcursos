from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .delivery import materialize_recipients
from .models import AdminNotification, NotificationRecipient


class AdminNotificationApiTests(APITestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(username="admin-notify", password="secret", is_staff=True)
        self.user = get_user_model().objects.create_user(username="recipient-notify", password="secret")
        self.client.force_authenticate(self.staff)

    def test_staff_can_create_and_publish_selected_notification(self):
        response = self.client.post("/api/backoffice/notifications/", {"title": "Manutenção", "scope": "selected_users", "selected_user_ids": [self.user.id]}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], AdminNotification.Status.DRAFT)
        published = self.client.post(f"/api/backoffice/notifications/{response.data['id']}/publish/", {}, format="json")
        self.assertEqual(published.status_code, 200)
        self.assertEqual(published.data["status"], AdminNotification.Status.PUBLISHED)
        self.assertEqual(published.data["metrics"]["total"], 1)

    def test_materializes_active_users_for_all_scope(self):
        item = AdminNotification.objects.create(title="Todos", scope=AdminNotification.Scope.ALL, status=AdminNotification.Status.PUBLISHED)
        self.assertEqual(materialize_recipients(item.id), 2)
        self.assertEqual(NotificationRecipient.objects.filter(notification=item).count(), 2)

    def test_rejects_unsafe_body_and_invalid_video(self):
        response = self.client.post("/api/backoffice/notifications/", {"title": "Teste", "body": "<script>alert(1)</script>", "video_url": "https://example.com/video", "scope": "selected_users", "selected_user_ids": [self.user.id]}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("body", response.data)
        self.assertIn("video_url", response.data)

    def test_required_notification_needs_reason_to_close(self):
        item = AdminNotification.objects.create(title="Obrigatório", priority=AdminNotification.Priority.REQUIRED, status=AdminNotification.Status.PUBLISHED)
        rejected = self.client.post(f"/api/backoffice/notifications/{item.id}/close/", {}, format="json")
        self.assertEqual(rejected.status_code, 400)
        closed = self.client.post(f"/api/backoffice/notifications/{item.id}/close/", {"reason": "Comunicado concluído"}, format="json")
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.data["status"], AdminNotification.Status.CLOSED)

    def test_recipient_cannot_access_another_users_admin_notice(self):
        item = AdminNotification.objects.create(title="Privado", status=AdminNotification.Status.PUBLISHED)
        recipient = NotificationRecipient.objects.create(notification=item, user=self.user)
        other = get_user_model().objects.create_user(username="other-notify", password="secret")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(f"/api/admin-notices/{recipient.id}/confirm/", {}, format="json").status_code, 404)
        self.client.force_authenticate(self.user)
        next_notice = self.client.get("/api/admin-notices/next/")
        self.assertEqual(next_notice.status_code, 200)
        self.assertEqual(next_notice.data["notification"]["recipient_id"], recipient.id)
        self.assertEqual(self.client.post(f"/api/admin-notices/{recipient.id}/postpone/", {}, format="json").status_code, 200)

    def test_postpone_respects_limit_and_next_api_hides_postponed_notice(self):
        item = AdminNotification.objects.create(title="Adiar", status=AdminNotification.Status.PUBLISHED, postpone_hours=24, max_postpones=1)
        recipient = NotificationRecipient.objects.create(notification=item, user=self.user)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post(f"/api/admin-notices/{recipient.id}/postpone/", {}, format="json").status_code, 200)
        self.assertIsNone(self.client.get("/api/admin-notices/next/").data["notification"])
        self.assertEqual(self.client.post(f"/api/admin-notices/{recipient.id}/postpone/", {}, format="json").status_code, 400)
