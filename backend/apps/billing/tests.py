from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.billing.models import Plan, Subscription


class BillingAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("billing-user", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.free = Plan.objects.get(slug="gratis")
        self.paid = Plan.objects.get(slug="padrao")

    def test_lists_active_plans_only(self):
        Plan.objects.create(slug="retired", name="Antigo", is_active=False)

        response = self.client.get("/api/plans/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["slug"] for item in response.data}, {"gratis", "padrao", "avancado"})

    def test_free_plan_is_activated_immediately(self):
        response = self.client.post(
            "/api/subscription/", {"plan": self.free.slug, "cycle": "mensal"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["checkout_required"])
        self.assertEqual(response.data["subscription"]["status"], Subscription.Status.ACTIVE)

    def test_paid_plan_waits_for_a_real_checkout(self):
        response = self.client.post(
            "/api/subscription/", {"plan": self.paid.slug, "cycle": "anual"}, format="json"
        )

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data["checkout_required"])
        self.assertEqual(response.data["subscription"]["status"], Subscription.Status.PENDING)
        self.assertIn("nenhuma cobrança", response.data["detail"])

    def test_subscription_is_private(self):
        other = get_user_model().objects.create_user("other-billing-user", password="password")
        Subscription.objects.create(user=other, plan=self.free)

        response = self.client.get("/api/subscription/")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data)
