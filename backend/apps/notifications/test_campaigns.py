from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.billing.models import Plan, Subscription
from .delivery import materialize_recipients, publish_due
from .models import AdminNotification, NotificationRecipient


class CampaignTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username="campaign-admin", is_staff=True)
        cls.admin.groups.add(Group.objects.get(name="Administrador"))
        cls.editor = get_user_model().objects.create_user(username="campaign-editor", is_staff=True)
        cls.editor.groups.add(Group.objects.get(name="Editor"))
        cls.user = get_user_model().objects.create_user(username="campaign-user")
        cls.plan = Plan.objects.create(slug="campaign-plan", name="Plano", monthly_price=10)
        Subscription.objects.create(user=cls.user, plan=cls.plan, status=Subscription.Status.ACTIVE)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def create_notice(self, **kwargs):
        data = {"title": "Aviso", "scope": "selected_users", "selected_user_ids": [self.user.pk], **kwargs}
        response = self.client.post("/api/backoffice/notifications/", data, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_segment_publish_is_async_after_commit_and_idempotent(self):
        notice = self.create_notice(scope="segment", segment_plan_slug=self.plan.slug, segment_subscription_status="active", selected_user_ids=[])
        url = f"/api/backoffice/notifications/{notice['id']}/publish/"
        with patch("django_q.tasks.async_task") as task:
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(self.client.post(url, {}, format="json").status_code, 200)
                task.assert_not_called()
            task.assert_called_once_with("apps.notifications.delivery.materialize_recipients", notice["id"])
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(self.client.post(url, {}, format="json").status_code, 200)
            self.assertEqual(task.call_count, 1)
        self.assertFalse(NotificationRecipient.objects.filter(notification_id=notice["id"]).exists())
        self.assertEqual(materialize_recipients(notice["id"]), 1)
        self.assertEqual(list(NotificationRecipient.objects.filter(notification_id=notice["id"]).values_list("user_id", flat=True)), [self.user.pk])
        new_user = get_user_model().objects.create_user(username="campaign-later")
        Subscription.objects.create(user=new_user, plan=self.plan, status=Subscription.Status.ACTIVE)
        self.assertEqual(materialize_recipients(notice["id"]), 0)
        self.assertEqual(NotificationRecipient.objects.filter(notification_id=notice["id"]).count(), 1)

    def test_scheduled_segment_enqueues_once_and_never_early(self):
        now = timezone.now()
        item = AdminNotification.objects.create(title="Agenda", scope="segment", status="scheduled", starts_at=now+timedelta(hours=1), segment_plan_slug=self.plan.slug)
        with patch("django_q.tasks.async_task") as task:
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(publish_due(), 0)
            task.assert_not_called()
            item.starts_at = now-timedelta(minutes=1)
            item.save()
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(publish_due(), 1)
                task.assert_not_called()
            task.assert_called_once_with("apps.notifications.delivery.materialize_recipients", item.pk)
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(publish_due(), 0)
            self.assertEqual(task.call_count, 1)
        self.assertEqual(materialize_recipients(item.pk), 1)

    def test_materialization_filters_inactive_and_wrong_subscription(self):
        wrong = get_user_model().objects.create_user(username="campaign-pending")
        inactive = get_user_model().objects.create_user(username="campaign-inactive", is_active=False)
        for user, status in ((wrong, "pending_payment"), (inactive, "active")):
            Subscription.objects.create(user=user, plan=self.plan, status=status)
        item = AdminNotification.objects.create(title="Segmento", scope="segment", status="published", segment_plan_slug=self.plan.slug, segment_subscription_status="active")
        self.assertEqual(materialize_recipients(item.pk), 1)
        self.assertEqual(item.recipients.get().user_id, self.user.pk)

    def test_empty_audience_is_frozen_and_closed_campaign_is_not_materialized(self):
        item = AdminNotification.objects.create(title="Vazio", scope="segment", status="published", segment_subscription_status="canceled")
        self.assertEqual(materialize_recipients(item.pk), 0)
        item.refresh_from_db()
        self.assertIsNotNone(item.recipients_materialized_at)
        item.status = "closed"
        item.save()
        self.assertEqual(materialize_recipients(item.pk), 0)

    def test_options_pagination_search_filters_and_minimal_fields(self):
        self.client.force_authenticate(self.editor)
        for name in ("option-a", "option-b", "option-c"):
            get_user_model().objects.create_user(username=name)
        one = self.client.get("/api/backoffice/notifications/options/?search=option-&limit=2")
        two = self.client.get("/api/backoffice/notifications/options/?search=option-&limit=2&page=2")
        self.assertEqual(one.status_code, 200)
        self.assertEqual(one.data["total"], 3)
        self.assertEqual(len(two.data["results"]), 1)
        self.assertFalse({row["id"] for row in one.data["results"]} & {row["id"] for row in two.data["results"]})
        response = self.client.get(f"/api/backoffice/notifications/options/?plan={self.plan.slug}&subscription_status=active")
        self.assertEqual([row["id"] for row in response.data["results"]], [self.user.pk])
        self.assertEqual(set(response.data["results"][0]), {"id", "username", "email"})

    def test_media_links_postponement_and_partial_segment_edit_roundtrip(self):
        notice = self.create_notice(scope="segment", selected_user_ids=[], segment_plan_slug=self.plan.slug,
            image_url="https://example.org/notice.png", video_url="https://www.youtube.com/watch?v=abc",
            links=[{"label": "Saiba mais", "url": "https://example.org/news"}], postpone_hours=48, max_postpones=2)
        response = self.client.patch(f"/api/backoffice/notifications/{notice['id']}/", {"summary":"Atualizado"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        for field in ("image_url", "video_url", "links", "postpone_hours", "max_postpones", "segment_plan_slug"):
            self.assertEqual(response.data[field], notice[field])

    def test_invalid_payloads_are_400_without_creating_campaigns(self):
        invalid = [
            {"video_url":"https://evilyoutube.com/watch?v=x"}, {"image_url":"javascript:alert(1)"},
            {"links":[{"label":"Teste", "url":"javascript:alert(1)"}]}, {"links":[{"url":"https://example.org"}]},
            {"links":[{"label":"FTP", "url":"ftp://example.org/file"}]}, {"postpone_hours":0}, {"postpone_hours":-1}, {"max_postpones":-1}, {"max_postpones":101},
            {"priority":"invalid"}, {"selected_user_ids":[{}]}, {"selected_user_ids":[]},
            {"scope":"segment", "segment_plan_slug":"missing"},
            {"scope":"segment", "segment_subscription_status":"invalid"},
            {"starts_at":"invalid"}, {"body":"<img src=x onerror=alert(1)>"},
        ]
        for data in invalid:
            with self.subTest(data=data):
                response = self.client.post("/api/backoffice/notifications/", {"title":"Aviso", "scope":"selected_users", "selected_user_ids":[self.user.pk], **data}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(AdminNotification.objects.count(), 0)

    def test_dates_expired_and_terminal_state_publication(self):
        now = timezone.now()
        response = self.client.post("/api/backoffice/notifications/", {"title":"Datas", "scope":"all", "starts_at":now.isoformat(), "ends_at":(now-timedelta(hours=1)).isoformat()}, format="json")
        self.assertEqual(response.status_code, 400)
        for state in ("closed", "archived"):
            item = AdminNotification.objects.create(title="Finalizado", status=state)
            self.assertEqual(self.client.post(f"/api/backoffice/notifications/{item.pk}/publish/", {}, format="json").status_code, 409)
        item = AdminNotification.objects.create(title="Expirado", scope="all", ends_at=now-timedelta(hours=1))
        self.assertEqual(self.client.post(f"/api/backoffice/notifications/{item.pk}/publish/", {}, format="json").status_code, 400)

    def test_scope_change_removes_manual_recipients_before_segment_publish(self):
        notice = self.create_notice()
        response = self.client.patch(f"/api/backoffice/notifications/{notice['id']}/", {"scope":"segment", "segment_plan_slug":self.plan.slug}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["metrics"]["total"], 0)
        self.assertEqual(response.data["selected_user_ids"], [])

    def test_recipient_tracking_is_paginated_filtered_and_restricted(self):
        notice = self.create_notice()
        item = AdminNotification.objects.get(pk=notice["id"])
        recipient = item.recipients.get()
        recipient.state = "viewed"
        recipient.confirmed_at = timezone.now()
        recipient.save()
        NotificationRecipient.objects.create(notification=item, user=self.admin, state="postponed", postpone_count=1, next_reminder_at=timezone.now()+timedelta(hours=24))
        url = f"/api/backoffice/notifications/{item.pk}/recipients/"
        self.client.force_authenticate(self.editor)
        response = self.client.get(url+"?state=viewed&limit=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        self.assertIsNotNone(response.data["results"][0]["confirmed_at"])
        response = self.client.get(url+"?search=campaign-admin")
        self.assertEqual(response.data["results"][0]["postpone_count"], 1)
        self.assertEqual(self.client.get(url+"?state=bad").status_code, 400)
        for user in (self.user, get_user_model().objects.create_user(username="campaign-reviewer", is_staff=True)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 403)

    def test_list_pagination_permissions_and_selected_ids_are_current(self):
        first = self.create_notice(title="Aviso A")
        self.create_notice(title="Aviso B")
        response = self.client.get("/api/backoffice/notifications/?limit=1&page=2&search=Aviso")
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertTrue(response.data["permissions"]["can_publish"])
        self.client.force_authenticate(self.editor)
        response = self.client.patch(f"/api/backoffice/notifications/{first['id']}/", {"selected_user_ids":[self.admin.pk]}, format="json")
        self.assertEqual(response.data["selected_user_ids"], [self.admin.pk])
        response = self.client.get("/api/backoffice/notifications/")
        self.assertTrue(response.data["permissions"]["can_edit"])
        self.assertFalse(response.data["permissions"]["can_publish"])

    def test_api_schedules_without_delivering_and_freezes_after_publication(self):
        start = timezone.now()+timedelta(hours=2)
        notice = self.create_notice(starts_at=start.isoformat())
        url = f"/api/backoffice/notifications/{notice['id']}/"
        response = self.client.post(url+"publish/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "scheduled")
        self.client.force_authenticate(self.user)
        self.assertIsNone(self.client.get("/api/admin-notices/next/").data["notification"])
        self.client.force_authenticate(self.admin)
        AdminNotification.objects.filter(pk=notice["id"]).update(starts_at=timezone.now()-timedelta(minutes=1))
        self.assertEqual(publish_due(), 1)
        response = self.client.patch(url, {"selected_user_ids":[self.admin.pk]}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(NotificationRecipient.objects.get(notification_id=notice["id"]).user_id, self.user.pk)

    def test_recipient_history_reflects_student_confirmation_and_postponement(self):
        notice = self.create_notice(postpone_hours=2, max_postpones=1)
        self.client.post(f"/api/backoffice/notifications/{notice['id']}/publish/", {}, format="json")
        self.client.force_authenticate(self.user)
        payload = self.client.get("/api/admin-notices/next/").data["notification"]
        self.assertEqual(payload["max_postpones"], 1)
        self.assertEqual(payload["postpone_count"], 0)
        recipient_id = payload["recipient_id"]
        response = self.client.post(f"/api/admin-notices/{recipient_id}/postpone/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(self.admin)
        url = f"/api/backoffice/notifications/{notice['id']}/recipients/"
        row = self.client.get(url).data["results"][0]
        self.assertEqual(row["postpone_count"], 1)
        self.assertEqual(row["state"], "postponed")
        self.assertIsNotNone(row["first_shown_at"])
        self.assertIsNotNone(row["next_reminder_at"])
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post(f"/api/admin-notices/{recipient_id}/confirm/", {}, format="json").status_code, 200)
        self.client.force_authenticate(self.admin)
        row = self.client.get(url).data["results"][0]
        self.assertEqual(row["state"], "viewed")
        self.assertIsNotNone(row["confirmed_at"])
