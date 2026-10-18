import csv
import datetime as dt
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing.models import PaymentEvent, Plan, Subscription
from .financial_reports import financial_report
from .models import AuditEvent


@override_settings(TIME_ZONE="America/Sao_Paulo")
class FinancialReportTests(TestCase):
    def setUp(self):
        self.since = dt.datetime(2026, 9, 10, tzinfo=dt.timezone.utc)
        self.until = self.since + dt.timedelta(days=7)
        self.admin = get_user_model().objects.create_user("finance-admin", is_staff=True, is_superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.sequence = 0
        self.plan = Plan.objects.get(slug="padrao")

    def receipt(self, *, when=None, amount=3990, **extra):
        self.sequence += 1
        data = dict(event_id=f"evt_finance_{self.sequence}", invoice_id=f"in_finance_{self.sequence}",
                    type=PaymentEvent.Type.SUCCEEDED, amount_minor=amount, currency="brl", processed=True,
                    paid_at=when or self.since, plan_slug="padrao", plan_name="Padrão original", billing_cycle="mensal")
        data.update(extra)
        return PaymentEvent.objects.create(**data)

    def report(self):
        return financial_report(self.since, self.until)

    def response(self, **extra):
        return self.client.get("/api/backoffice/reports/business/", {"since": self.since.isoformat(), "until": self.until.isoformat(), **extra})

    def test_cash_uses_paid_at_and_half_open_period_with_equal_previous_window(self):
        self.receipt(when=self.since - dt.timedelta(days=7), amount=10000)
        self.receipt(when=self.since - dt.timedelta(microseconds=1), amount=5000)
        self.receipt(when=self.since, amount=10000)
        self.receipt(when=self.until - dt.timedelta(microseconds=1), amount=20000, type=PaymentEvent.Type.RENEWED)
        self.receipt(when=self.until, amount=999999)
        report = self.report()
        self.assertEqual(report["received_revenue"], "300.00")
        self.assertEqual(report["previous_received_revenue"], "150.00")
        self.assertEqual(report["received_revenue_change_percent"], 100.0)
        self.assertEqual(report["payments_count"], 2)
        self.assertEqual(report["new_paid_subscriptions"], 1)
        self.assertEqual(report["renewals"], 1)
        self.assertIsNone(report["reactivations"])
        self.assertEqual(report["average_ticket_received"], "150.00")

    def test_legacy_and_foreign_currency_are_visible_exclusions_without_invented_revenue(self):
        valid = self.receipt(amount=2000)
        self.receipt(currency="usd", amount=100000)
        self.receipt(processed=False)
        self.receipt(invoice_id="")
        self.receipt(amount=None)
        legacy = self.receipt(paid_at=None)
        PaymentEvent.objects.filter(pk=legacy.pk).update(created_at=self.since)
        report = self.report()
        self.assertEqual(report["received_revenue"], "20.00")
        self.assertEqual(report["excluded_receipts"], 5)
        self.assertEqual(report["coverage"], "partial")
        self.assertIsNone(report["received_revenue_change_percent"])
        PaymentEvent.objects.filter(pk=valid.pk).delete()
        report = self.report()
        self.assertIsNone(report["received_revenue"])
        self.assertEqual(report["coverage"], "unavailable")

    def test_empty_zero_paid_and_rounding_are_distinguished(self):
        self.assertEqual(self.report()["received_revenue"], "0.00")
        self.assertIsNone(self.report()["average_ticket_received"])
        self.receipt(amount=0)
        report = self.report()
        self.assertEqual(report["payments_count"], 1)
        self.assertEqual(report["received_revenue"], "0.00")
        self.assertIsNone(report["received_revenue_change_percent"])
        self.receipt(amount=1)
        self.receipt(amount=1)
        self.assertEqual(self.report()["average_ticket_received"], "0.01")

    def test_attribution_is_snapshot_even_if_catalog_or_subscription_changes(self):
        self.receipt(amount=19900, billing_cycle="semestral")
        self.receipt(amount=39900, billing_cycle="anual", plan_slug="avancado", plan_name="Avançado original")
        self.receipt(amount=100, plan_slug="", plan_name="", billing_cycle="")
        self.plan.name, self.plan.monthly_price = "Outro nome", Decimal("999.00")
        self.plan.save()
        rows = self.report()["revenue_by_plan_cycle"]
        self.assertEqual(sum(Decimal(row["received_revenue"]) for row in rows), Decimal("599.00"))
        self.assertEqual({row["plan_name"] for row in rows}, {"Padrão original", "Avançado original", "Não identificado"})
        self.assertNotIn("Outro nome", str(rows))

    def test_daily_groups_respect_report_timezone_across_midnight(self):
        self.receipt(when=dt.datetime(2026, 9, 11, 2, 59, tzinfo=dt.timezone.utc), amount=100)
        self.receipt(when=dt.datetime(2026, 9, 11, 3, 0, tzinfo=dt.timezone.utc), amount=200)
        rows = self.report()["daily_revenue"]
        self.assertEqual([str(row["date"]) for row in rows], ["2026-09-10", "2026-09-11"])
        self.assertEqual([row["received_revenue"] for row in rows], ["1.00", "2.00"])

    def create_subscription(self, cycle, minor, **extra):
        self.sequence += 1
        user = get_user_model().objects.create_user(f"subscriber-{self.sequence}")
        data = dict(user=user, plan=self.plan, cycle=cycle, status="active", gateway="stripe", provider_status="active",
                    provider_subscription_id=f"sub_{self.sequence}", price_amount_minor=minor, currency="brl",
                    current_period_end=timezone.now() + dt.timedelta(days=30))
        data.update(extra)
        return Subscription.objects.create(**data)

    def test_mrr_normalizes_locked_cycle_price_and_excludes_nonrecurring_states(self):
        self.create_subscription("mensal", 3990)
        self.create_subscription("semestral", 19900)
        self.create_subscription("anual", 39900)
        self.create_subscription("mensal", 9900, cancel_at_period_end=True)
        self.create_subscription("mensal", 9900, provider_status="past_due")
        self.create_subscription("mensal", 9900, current_period_end=timezone.now() - dt.timedelta(seconds=1))
        self.create_subscription("mensal", 9900, gateway="local")
        self.create_subscription("mensal", 9900, status="canceled")
        self.create_subscription("mensal", None)
        self.create_subscription("mensal", 9900, currency="usd")
        self.plan.monthly_price = Decimal("999.00")
        self.plan.save()
        report = self.report()
        self.assertEqual(report["mrr"], "106.32")
        self.assertEqual(report["arr"], "1275.80")
        self.assertEqual(report["recurring_subscriptions"], 3)
        self.assertEqual(report["active_subscriptions"], 5)
        self.assertEqual(report["scheduled_cancellations"], 1)
        self.assertEqual(report["past_due_subscriptions"], 1)
        self.assertEqual(report["average_ticket_mrr"], "35.44")

    def test_cancellation_and_failure_use_provider_event_date_not_delivery(self):
        self.receipt(type=PaymentEvent.Type.CANCELED, paid_at=None, provider_created_at=self.since)
        self.receipt(type=PaymentEvent.Type.FAILED, paid_at=None, provider_created_at=self.until)
        report = self.report()
        self.assertEqual(report["canceled_subscriptions"], 1)
        self.assertEqual(report["payments_failed"], 0)
        self.assertEqual(report["received_revenue"], "0.00")

    def test_json_and_csv_are_restricted_audited_and_not_cached(self):
        self.receipt(amount=12345)
        staff = get_user_model().objects.create_user("reports-editor", is_staff=True)
        permission = Permission.objects.get(content_type__app_label="backoffice", codename="view_financial_reports")
        staff.user_permissions.add(permission)
        self.client.force_authenticate(staff)
        for export in ({}, {"export": "csv"}):
            response = self.response(**export)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Cache-Control"], "no-store")
            if export:
                self.assertNotIn("financial.received_revenue", response.content.decode())
                self.assertNotIn("123.45", response.content.decode())
            else:
                self.assertEqual(response.data["financial"], {"access_granted": False})
        staff.groups.add(Group.objects.get(name="Administrador"))
        self.assertEqual(self.response().data["financial"]["received_revenue"], "123.45")
        self.assertTrue(AuditEvent.objects.filter(action="report.viewed", context__financial_access=True).exists())
        self.assertTrue(AuditEvent.objects.filter(action="report.exported", context__financial_access=False).exists())

    def test_csv_includes_grouped_values_period_definitions_and_formula_protection(self):
        self.receipt(plan_name="=HYPERLINK(bad)", amount=12345)
        response = self.response(export="csv")
        self.assertEqual(response.status_code, 200)
        rows = dict(csv.reader(StringIO(response.content.decode())))
        self.assertEqual(rows["financial.received_revenue"], "123.45")
        self.assertEqual(rows["financial.revenue_by_plan_cycle.0.plan_name"], "'=HYPERLINK(bad)")
        self.assertIn("period.timezone", rows)
        self.assertIn("financial.definitions.mrr", rows)
        self.assertIn("financial.daily_revenue.0.received_revenue", rows)

    def test_invalid_dates_ranges_and_future_periods_are_rejected(self):
        for params in ({"since": "bad"}, {"until": "2026-02-31"}, {"days": "bad"}, {"days": 366}, {"days": 0},
                       {"since": self.until.isoformat()}, {"since": "2020-01-01"}, {"until": "2099-01-01"}, {"since": "0001-01-01", "until": "0001-01-02"}):
            with self.subTest(params=params):
                self.assertEqual(self.response(**params).status_code, 400)

    def test_api_supports_local_date_input_and_returns_timezone(self):
        response = self.client.get("/api/backoffice/reports/business/", {"since": "2026-09-10", "until": "2026-09-17"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["period"]["timezone"], "America/Sao_Paulo")
        self.assertEqual(response.data["period"]["since"].utcoffset(), dt.timedelta(hours=-3))

    def test_group_limit_is_explicit_and_does_not_truncate_totals(self):
        PaymentEvent.objects.bulk_create([
            PaymentEvent(event_id=f"evt_bulk_{index}", invoice_id=f"in_bulk_{index}", type=PaymentEvent.Type.SUCCEEDED,
                         processed=True, amount_minor=100, currency="brl", paid_at=self.since,
                         plan_slug=f"plan-{index:03d}", plan_name=f"Plano {index}", billing_cycle="mensal")
            for index in range(201)
        ])
        report = self.report()
        self.assertEqual(report["received_revenue"], "201.00")
        self.assertEqual(report["payments_count"], 201)
        self.assertTrue(report["revenue_groups_truncated"])
        self.assertEqual(len(report["revenue_by_plan_cycle"]), 200)

    def test_historical_report_keeps_current_subscription_and_risk_snapshots(self):
        # Historical windows affect flows, not the state of current subscriptions.
        active = self.create_subscription("mensal", 3990)
        expired = self.create_subscription("mensal", 3990, current_period_end=timezone.now() - dt.timedelta(days=1))
        response = self.response()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["financial"]["active_subscriptions"], 1)
        self.assertEqual(response.data["operation"]["users_at_risk"]["paid_without_activity_30_days"], 1)
        self.assertGreater(active.current_period_end, timezone.now())
        self.assertLess(expired.current_period_end, timezone.now())

    def test_incomplete_previous_period_disables_percentage_even_with_known_amounts(self):
        self.receipt(amount=1000)
        self.receipt(when=self.since - dt.timedelta(days=1), amount=1000)
        self.receipt(when=self.since - dt.timedelta(days=1), amount=None)
        report = self.report()
        self.assertEqual(report["previous_received_revenue"], "10.00")
        self.assertEqual(report["previous_excluded_receipts"], 1)
        self.assertIsNone(report["received_revenue_change_percent"])
