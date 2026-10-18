from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.utils import timezone
from .tests import Base
from apps.billing.models import Subscription


class SubscriptionsConsolidationTests(Base):
    def test_filters_pagination_and_stable_order(self):
        for index in range(4):
            user = get_user_model().objects.create_user(f"filtered-{index}")
            Subscription.objects.create(user=user, plan=self.gratis if index == 3 else self.padrao, cycle="mensal", status="active", current_period_end=timezone.now() + timedelta(days=5))
        response = self.client.get("/api/backoffice/subscriptions/", {"search": "filtered", "plan": "padrao", "cycle": "mensal", "status": "valid", "expires_within": 30, "page": 2, "page_size": 2, "ordering": "name"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual([row["username"] for row in response.data["results"]], ["filtered-2"])
        response = self.client.get("/api/backoffice/subscriptions/", {"page": 99, "page_size": 2})
        self.assertEqual(response.data["page"], 3)
        for params in ({"page": "bad"}, {"expires_within": "bad"}, {"expires_within": -1}):
            self.assertEqual(self.client.get("/api/backoffice/subscriptions/", params).status_code, 400)

    def test_financial_permission_contracted_price_and_expiration(self):
        self.sub.status = "active"
        self.sub.cycle = "mensal"
        self.sub.price_amount_minor = 5000
        self.sub.current_period_end = timezone.now() + timedelta(days=5)
        self.sub.save()
        user = get_user_model().objects.create_user("expired-sub")
        Subscription.objects.create(user=user, plan=self.padrao, status="active", current_period_end=timezone.now() - timedelta(days=1))
        response = self.client.get("/api/backoffice/subscriptions/overview/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["mrr_estimated"])
        self.assertEqual(response.data["active"], 1)
        self.assertEqual(response.data["expiring_30_days"], 1)
        self.staff.user_permissions.add(Permission.objects.get(codename="view_financial_reports"))
        self.client.force_authenticate(get_user_model().objects.get(pk=self.staff.pk))
        self.assertEqual(self.client.get("/api/backoffice/subscriptions/overview/").data["mrr_estimated"], "50.00")
        expired = self.client.get("/api/backoffice/subscriptions/", {"expired": "true"})
        self.assertEqual(expired.data["count"], 1)
        self.assertEqual(expired.data["results"][0]["username"], "expired-sub")

    def test_empty_overview_and_student_access(self):
        Subscription.objects.all().delete()
        self.staff.is_superuser = True
        self.staff.save()
        response = self.client.get("/api/backoffice/subscriptions/overview/")
        self.assertEqual(response.data["mrr_estimated"], "0.00")
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/backoffice/subscriptions/overview/").status_code, 403)
        self.assertEqual(self.client.get("/api/backoffice/subscriptions/").status_code, 403)
