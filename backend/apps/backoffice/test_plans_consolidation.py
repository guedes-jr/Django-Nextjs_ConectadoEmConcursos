from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.utils import timezone

from .tests import Base
from apps.billing.models import Plan, Subscription


class PlansConsolidationTests(Base):
    def test_benefit_search_and_paginated_ordering(self):
        for index in range(3):
            Plan.objects.create(slug=f"special-{index}", name=f"Special {index}",
                                features=["Correção exclusiva"], monthly_price=30 - index)
        response = self.client.get("/api/backoffice/plans/", {
            "q": "EXCLUSIVA", "ordering": "price", "page": 2, "page_size": 2,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual([p["slug"] for p in response.data["results"]], ["special-0"])
        response = self.client.get("/api/backoffice/plans/", {"q": "exclusiva", "page": 99, "page_size": 2})
        self.assertEqual(response.data["page"], 2)
        self.assertEqual(len(self.client.get("/api/backoffice/plans/").data["results"]), Plan.objects.count())

    def test_rejects_invalid_prices_features_and_pagination(self):
        for payload in ({"monthly_price": "-1"}, {"features": "invalid"}, {"features": [""]}):
            response = self.client.patch(f"/api/backoffice/plans/{self.padrao.id}/", payload, format="json")
            self.assertEqual(response.status_code, 400)
        for params in ({"price_max": "NaN"}, {"price_min": "-1"}, {"page": "invalid"}):
            self.assertEqual(self.client.get("/api/backoffice/plans/", params).status_code, 400)

    def test_archive_and_draft_pause_sales_and_activation_requires_publication(self):
        for action in ("archive", "draft"):
            self.padrao.status = Plan.Status.PUBLISHED
            self.padrao.is_active = True
            self.padrao.save()
            response = self.client.post("/api/backoffice/plans/bulk/", {"ids": [self.padrao.id], "action": action}, format="json")
            self.assertEqual(response.status_code, 200)
            self.padrao.refresh_from_db()
            self.assertFalse(self.padrao.is_active)
            self.assertEqual(self.client.post("/api/backoffice/plans/bulk/", {"ids": [self.padrao.id], "action": "activate"}, format="json").status_code, 400)
        response = self.client.patch(f"/api/backoffice/plans/{self.padrao.id}/", {"status": "archived", "is_active": True}, format="json")
        self.assertFalse(response.data["is_active"])

    def test_overview_respects_permission_expiry_and_contracted_amount(self):
        self.sub.status = Subscription.Status.ACTIVE
        self.sub.cycle = "mensal"
        self.sub.price_amount_minor = 5000
        self.sub.current_period_end = timezone.now() + timedelta(days=2)
        self.sub.save()
        other = get_user_model().objects.create_user("expired")
        Subscription.objects.create(user=other, plan=self.padrao, status="active", cycle="mensal", current_period_end=timezone.now() - timedelta(days=1))
        response = self.client.get("/api/backoffice/plans/overview/")
        self.assertIsNone(response.data["mrr_estimated"])
        self.assertTrue(all(row["mrr_estimated"] is None for row in response.data["plans"]))
        self.staff.user_permissions.add(Permission.objects.get(codename="view_financial_reports"))
        # Reload to avoid Django's cached permission set from the first request.
        self.client.force_authenticate(get_user_model().objects.get(pk=self.staff.pk))
        response = self.client.get("/api/backoffice/plans/overview/")
        self.assertEqual(Decimal(response.data["mrr_estimated"]), Decimal("50.00"))
        metric = next(item for item in response.data["plans"] if item["id"] == self.padrao.id)
        self.assertEqual(metric["subscribers_active"], 1)
