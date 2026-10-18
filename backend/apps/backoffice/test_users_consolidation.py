from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from .tests import Base
from .models import AuditEvent
from apps.billing.models import Subscription
from apps.workspace.models import SimulationRun

User = get_user_model()


class UsersConsolidationTests(Base):
    def test_create_regular_user_validates_credentials_and_audits_without_password(self):
        data = {"username": "new-student", "email": "New@Example.test", "password": "Only-Tests!482-valid", "is_staff": True, "is_superuser": True}
        response = self.client.post("/api/backoffice/users/", data, format="json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(pk=response.data["id"])
        self.assertEqual(user.email, "new@example.test")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password(data["password"]))
        self.assertNotIn("password", response.data)
        event = AuditEvent.objects.get(action="user.created", resource_id=str(user.id))
        self.assertNotIn(data["password"], str(event.after))
        for changes in ({"username": "other", "email": "NEW@example.test"}, {"username": "other", "email": "bad"}, {"username": "other", "email": "other@example.test", "password": "123"}):
            response = self.client.post("/api/backoffice/users/", {**data, **changes}, format="json")
            self.assertEqual(response.status_code, 400)

    def test_creation_and_summary_require_administrator(self):
        for client in (APIClient(), self.client):
            if client is self.client: client.force_authenticate(self.user)
            self.assertIn(client.get("/api/backoffice/users/overview/").status_code, (401, 403))
            self.assertIn(client.post("/api/backoffice/users/", {"username": "bad"}, format="json").status_code, (401, 403))

    def test_activity_filter_precedes_pagination_and_count(self):
        users = [User.objects.create_user(f"page-user-{index}") for index in range(5)]
        # The only matching user is beyond the first page of the unfiltered list.
        SimulationRun.objects.create(user=users[0])
        response = self.client.get("/api/backoffice/users/", {"search": "page-user", "activity": "active", "page": 1, "page_size": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        self.assertEqual([row["id"] for row in response.data["results"]], [users[0].id])
        inactive = self.client.get("/api/backoffice/users/", {"search": "page-user", "activity": "inactive", "page_size": 2, "page": 2})
        self.assertEqual(inactive.data["total"], 4)
        self.assertEqual(len(inactive.data["results"]), 2)

    def test_pagination_sorting_and_invalid_values(self):
        for index in range(5): User.objects.create_user(f"sort-user-{index}")
        response = self.client.get("/api/backoffice/users/", {"search": "sort-user", "page": 2, "page_size": 2, "ordering": "name"})
        self.assertEqual(response.data["total"], 5)
        self.assertEqual([row["username"] for row in response.data["results"]], ["sort-user-2", "sort-user-3"])
        response = self.client.get("/api/backoffice/users/", {"search": "sort-user", "page": 99, "page_size": 2})
        self.assertEqual(response.data["page"], 3)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(self.client.get("/api/backoffice/users/", {"page": "bad"}).status_code, 400)
        self.assertEqual(self.client.get("/api/backoffice/users/", {"limit": "bad"}).status_code, 400)

    def test_summary_matches_filters_and_excludes_expired_subscriptions(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False, date_joined=timezone.now() - timedelta(days=60))
        self.sub.status = Subscription.Status.ACTIVE
        self.sub.current_period_end = timezone.now() - timedelta(days=1)
        self.sub.save()
        summary = self.client.get("/api/backoffice/users/overview/").data
        self.assertEqual(summary, {"total": 2, "active": 1, "blocked": 1, "new_30_days": 1, "valid_subscriptions": 0})
        for key, params in (("active", {"status": "active"}), ("blocked", {"status": "blocked"}), ("new_30_days", {"registered": "recent"}), ("valid_subscriptions", {"subscription": "valid"})):
            self.assertEqual(self.client.get("/api/backoffice/users/", params).data["total"], summary[key])
