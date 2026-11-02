from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.billing.models import Plan, Subscription


class BillingAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("billing-user", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.free = Plan.objects.get(slug="gratis")
        self.paid = Plan.objects.get(slug="padrao")

    def test_lists_active_plans_for_anonymous_users(self):
        Plan.objects.create(slug="retired", name="Antigo", is_active=False)

        response = APIClient().get("/api/plans/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["slug"] for item in response.data}, {"gratis", "padrao", "avancado"})

    def test_free_plan_is_activated_immediately(self):
        response = self.client.post(
            "/api/subscription/", {"plan": self.free.slug, "cycle": "mensal"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["checkout_required"])
        self.assertEqual(response.data["subscription"]["status"], Subscription.Status.ACTIVE)

    @override_settings(STRIPE_SECRET_KEY="", STRIPE_WEBHOOK_SECRET="")
    def test_paid_plan_waits_for_a_real_checkout(self):
        response = self.client.post(
            "/api/subscription/", {"plan": self.paid.slug, "cycle": "anual"}, format="json"
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(Subscription.objects.get(user=self.user).plan.slug, "gratis")

    def test_subscription_is_private(self):
        other = get_user_model().objects.create_user("other-billing-user", password="password")

        response = self.client.get("/api/subscription/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["plan"]["slug"], "gratis")
        self.assertEqual(response.data["status"], "active")
        self.assertNotEqual(response.data["id"], other.subscription.pk)


class DefaultFreeSubscriptionTests(TestCase):
    def test_user_creation_assigns_active_free_plan(self):
        user = get_user_model().objects.create_user("default-free")
        sub = Subscription.objects.get(user=user)
        self.assertEqual(sub.plan.slug, "gratis")
        self.assertEqual(sub.status, Subscription.Status.ACTIVE)
        self.assertEqual(sub.gateway, Subscription.Gateway.LOCAL)
        self.assertEqual(sub.price_amount_minor, 0)
        self.assertIsNone(sub.current_period_end)

    def test_saving_user_preserves_existing_paid_subscription(self):
        user = get_user_model().objects.create_user("keep-paid")
        Subscription.objects.filter(user=user).update(plan=Plan.objects.get(slug="padrao"))
        user.first_name = "Aluno"
        user.save()
        self.assertEqual(Subscription.objects.get(user=user).plan.slug, "padrao")
        self.assertEqual(Subscription.objects.filter(user=user).count(), 1)

    def test_backfill_assigns_only_missing_subscriptions_and_is_idempotent(self):
        from importlib import import_module
        from types import SimpleNamespace
        from django.apps import apps
        from django.db import connection

        missing = get_user_model().objects.create_user("missing-plan")
        existing = get_user_model().objects.create_user("existing-plan")
        Subscription.objects.filter(user=missing).delete()
        Subscription.objects.filter(user=existing).update(
            plan=Plan.objects.get(slug="padrao"), status=Subscription.Status.PENDING,
        )
        before = Subscription.objects.filter(user=existing).values().get()
        migration = import_module("apps.billing.migrations.0008_default_free_subscriptions")
        editor = SimpleNamespace(connection=connection)
        migration.assign_free_subscriptions(apps, editor)
        migration.assign_free_subscriptions(apps, editor)
        self.assertEqual(Subscription.objects.filter(user=existing).values().get(), before)
        sub = Subscription.objects.get(user=missing)
        self.assertEqual(sub.plan.slug, "gratis")
        self.assertEqual(sub.status, Subscription.Status.ACTIVE)
        self.assertEqual(Subscription.objects.filter(user=missing).count(), 1)
