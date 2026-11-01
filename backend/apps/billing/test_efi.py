from datetime import datetime, timezone as dt_timezone
from unittest.mock import patch, Mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.backoffice.models import AuditEvent
from apps.billing import efi_gateway as gateway
from apps.billing.efi_checkout import period_end
from apps.billing.models import BillingCheckout, PaymentConfiguration, PaymentEvent, Plan, Subscription
from apps.billing.services import user_plan_slug
from apps.billing.stripe_gateway import GatewayUnavailable

CONFIG = dict(BILLING_GATEWAY="efi", EFI_CLIENT_ID="test-client", EFI_CLIENT_SECRET="test-secret",
              EFI_SANDBOX=True, EFI_NOTIFICATION_URL="https://example.test/api/billing/efi/notifications/", DEBUG=True)


@override_settings(**CONFIG)
class EfiBillingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("efi-reader")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.plan = Plan.objects.get(slug="padrao")
        self.network = patch("apps.billing.efi_gateway.requests.request", side_effect=AssertionError("Unmocked provider request"))
        self.network.start(); self.addCleanup(self.network.stop)

    def attempt(self, **extra):
        return BillingCheckout.objects.create(user=self.user, plan=self.plan, cycle="mensal", amount_minor=3990,
            price_id=gateway.fingerprint(gateway.configuration()), gateway="efi", sandbox=True, **extra)

    def charge(self, attempt, state="paid", **extra):
        return {"charge_id": 1234, "custom_id": str(attempt.pk), "total": 3990, "status": state, **extra}

    def choose(self):
        return self.client.post("/api/subscription/", {"plan": self.plan.slug, "cycle": "mensal"}, format="json")

    def notify(self, attempt, state="paid", **extra):
        event = {"type": "charge", "identifiers": {"charge_id": 1234}, "custom_id": str(attempt.pk),
                 "status": {"current": state}, "created_at": "2026-11-01 09:00:00"}
        with patch.object(gateway, "request", side_effect=[[event], self.charge(attempt, state, **extra)]):
            return APIClient(enforce_csrf_checks=True).post("/api/billing/efi/notifications/", {"notification": "valid-token"})

    def test_checkout_all_methods_reuses_attempt_and_never_grants_access(self):
        def create(method, path, *, data, attempt):
            self.assertEqual(path, "charge/one-step/link")
            self.assertEqual(data["settings"]["payment_method"], "all")
            self.assertEqual(data["items"][0]["value"], int(self.plan.monthly_price * 100))
            return self.charge(attempt, "link", total=attempt.amount_minor, payment_url="https://pagamento.gerencianet.com.br/test")
        with patch.object(gateway, "request", side_effect=create):
            result = self.choose()
        self.assertEqual(result.status_code, 202)
        self.assertEqual(result.data["checkout_gateway"], "efi")
        self.assertFalse(Subscription.objects.filter(user=self.user).exists())
        attempt = BillingCheckout.objects.get(user=self.user)
        with patch.object(gateway, "request", return_value=self.charge(attempt, "link", total=attempt.amount_minor)):
            result = self.choose()
        self.assertEqual(result.status_code, 202)
        self.assertEqual(BillingCheckout.objects.count(), 1)

    def test_paid_notification_is_idempotent_and_activates_period(self):
        attempt = self.attempt(session_id="1234", status="open")
        self.assertEqual(self.notify(attempt).status_code, 200)
        end = Subscription.objects.get(user=self.user).current_period_end
        self.assertEqual(self.notify(attempt).status_code, 200)
        self.assertEqual(PaymentEvent.objects.filter(type="payment.succeeded").count(), 1)
        self.assertEqual(Subscription.objects.get(user=self.user).current_period_end, end)
        self.assertEqual(user_plan_slug(self.user), "padrao")
        self.assertEqual(PaymentEvent.objects.get().paid_at.hour, 12)  # notification timezone → UTC
        self.assertEqual(PaymentEvent.objects.get().payload, {})

    def test_approved_or_manual_settlement_does_not_activate(self):
        attempt = self.attempt(session_id="1234", status="open")
        for state in ["approved", "waiting", "settled"]:
            self.assertEqual(self.notify(attempt, state).status_code, 200)
            self.assertFalse(Subscription.objects.filter(user=self.user).exists())
            self.assertFalse(PaymentEvent.objects.exists())

    def test_wrong_amount_or_custom_id_does_not_activate(self):
        attempt = self.attempt(session_id="1234", status="open")
        self.assertEqual(self.notify(attempt, total=1).status_code, 400)
        self.assertEqual(self.notify(attempt, custom_id="another-order").status_code, 400)
        self.assertFalse(Subscription.objects.exists())

    def test_uncertain_creation_is_recovered_by_notification_without_duplicate(self):
        with patch.object(gateway, "request", side_effect=GatewayUnavailable()):
            self.assertEqual(self.choose().status_code, 503)
        attempt = BillingCheckout.objects.get()
        self.assertEqual(self.choose().status_code, 409)
        self.assertEqual(BillingCheckout.objects.count(), 1)
        # Amount must match the original catalog snapshot.
        self.assertEqual(self.notify(attempt, total=attempt.amount_minor).status_code, 200)
        attempt.refresh_from_db()
        self.assertEqual(attempt.session_id, "1234")
        self.assertEqual(attempt.status, "complete")

    def test_refund_revokes_only_matching_access_and_cannot_be_replayed(self):
        attempt = self.attempt(session_id="1234", status="open")
        self.notify(attempt)
        self.assertEqual(self.notify(attempt, "refunded").status_code, 200)
        self.assertEqual(user_plan_slug(self.user), "gratis")
        self.notify(attempt)
        self.assertEqual(user_plan_slug(self.user), "gratis")

    def test_get_subscription_refreshes_canonical_state(self):
        attempt = self.attempt(session_id="1234", status="processing")
        with patch.object(gateway, "request", return_value=self.charge(attempt)):
            result = self.client.get("/api/subscription/")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.data["access_active"])

    def test_active_period_cannot_be_replaced_and_expiry_removes_access(self):
        attempt = self.attempt(session_id="1234", status="open")
        self.notify(attempt)
        self.assertEqual(self.choose().status_code, 409)
        Subscription.objects.filter(user=self.user).update(current_period_end=timezone.now())
        self.assertEqual(user_plan_slug(self.user), "gratis")

    def test_cancellation_requires_canonical_confirmation(self):
        attempt = self.attempt(session_id="1234", status="open")
        with patch.object(gateway, "request", side_effect=[self.charge(attempt, "link"), None, self.charge(attempt, "canceled")]) as request:
            result = self.client.post("/api/subscription/checkout/expire/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(request.call_args_list[1].args, ("PUT", "charge/1234/cancel"))
        attempt.refresh_from_db(); self.assertEqual(attempt.status, "expired")
        # A boleto paid after cancellation still gets recorded and fulfilled.
        self.assertEqual(self.notify(attempt).status_code, 200)
        self.assertEqual(user_plan_slug(self.user), "padrao")

    def test_cross_environment_cannot_be_queried(self):
        attempt = self.attempt(session_id="1234", status="open")
        with override_settings(EFI_SANDBOX=False):
            with self.assertRaises(GatewayUnavailable):
                gateway.request("GET", "charge/1234", attempt=attempt)

    @override_settings(DEBUG=False)
    def test_sandbox_cannot_activate_production_access(self):
        self.assertEqual(self.choose().status_code, 503)
        self.assertFalse(BillingCheckout.objects.exists())

    def test_untrusted_notification_and_redirects_are_rejected(self):
        response = APIClient().post("/api/billing/efi/notifications/", {"notification": "../../bad"})
        self.assertEqual(response.status_code, 400)
        for url in ["https://pagamento.gerencianet.com.br.evil.test/a", "http://pagamento.gerencianet.com.br/a", "https://evil@pagamento.gerencianet.com.br/a", "https://pagamento.gerencianet.com.br:80/a"]:
            self.assertFalse(gateway.valid_url(url))

    def test_paid_access_and_receipts_appear_in_reports_without_recurring_mrr(self):
        from datetime import timedelta
        from apps.backoffice.financial_reports import financial_report
        attempt = self.attempt(session_id="1234", status="open")
        self.notify(attempt)
        report = financial_report(timezone.now() - timedelta(days=3650), timezone.now() + timedelta(days=1))
        self.assertEqual(report["active_subscriptions"], 1)
        self.assertEqual(report["recurring_subscriptions"], 0)
        self.assertEqual(report["mrr"], "0.00")
        self.assertEqual(report["received_revenue"], "39.90")

    def test_late_payment_preserves_newer_plan_and_records_reconciliation(self):
        from datetime import timedelta
        other_plan = Plan.objects.get(slug="avancado")
        current = Subscription.objects.create(user=self.user, plan=other_plan, cycle="anual", status="active", gateway="efi",
            checkout_id="newer-order", current_period_end=timezone.now() + timedelta(days=365))
        end = current.current_period_end
        attempt = self.attempt(session_id="1234", status="expired")
        self.notify(attempt)
        current.refresh_from_db()
        self.assertEqual(current.plan_id, other_plan.pk)
        self.assertEqual(current.current_period_end, end)
        self.assertEqual(PaymentEvent.objects.filter(type="payment.succeeded").count(), 1)
        self.notify(attempt, "refunded")
        current.refresh_from_db()
        self.assertEqual(current.status, "active")

    def test_other_user_cannot_expire_checkout(self):
        attempt = self.attempt(session_id="1234", status="open")
        other = get_user_model().objects.create_user("other-efi-reader")
        self.client.force_authenticate(other)
        with patch.object(gateway, "request") as request:
            self.assertEqual(self.client.post("/api/subscription/checkout/expire/").status_code, 200)
            request.assert_not_called()
        attempt.refresh_from_db(); self.assertEqual(attempt.status, "open")

    def test_existing_sandbox_charge_cannot_activate_after_production_deploy(self):
        attempt = self.attempt(session_id="1234", status="open")
        with override_settings(DEBUG=False):
            self.assertEqual(self.notify(attempt).status_code, 503)
        self.assertFalse(Subscription.objects.filter(user=self.user).exists())

    def test_month_end_and_leap_year(self):
        start = datetime(2028, 1, 31, tzinfo=dt_timezone.utc)
        self.assertEqual(period_end(start, "mensal").day, 29)
        self.assertEqual(period_end(start.replace(month=2, day=29), "anual").day, 28)

    def test_authentication_uses_fixed_api_host_and_never_redirects(self):
        response = Mock(status_code=200)
        response.json.return_value = {"access_token": "safe-test-token"}
        with patch("apps.billing.efi_gateway.requests.request", return_value=response) as request:
            base, _ = gateway.authorize()
        self.assertEqual(base, "https://cobrancas-h.api.efipay.com.br")
        self.assertFalse(request.call_args.kwargs["allow_redirects"])
        self.assertEqual(request.call_args.kwargs["auth"], ("test-client", "test-secret"))


@override_settings(**CONFIG)
class PaymentConfigurationTests(TestCase):
    endpoint = "/api/backoffice/settings/payments/"

    def setUp(self):
        self.user = get_user_model().objects.create_superuser("payments-admin", email="admin@example.test", password="synthetic-password")
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.data = {"gateway": "efi", "enabled": True, "sandbox": True,
                     "notification_url": CONFIG["EFI_NOTIFICATION_URL"], "client_id": "stored-client", "client_secret": "stored-secret"}

    def test_only_superusers_can_manage_or_test(self):
        staff = get_user_model().objects.create_user("ordinary-staff", is_staff=True)
        self.client.force_authenticate(staff)
        for method, endpoint in [("get", self.endpoint), ("put", self.endpoint), ("post", self.endpoint + "test/")]:
            self.assertEqual(getattr(self.client, method)(endpoint, self.data, format="json").status_code, 403)

    def test_credentials_are_encrypted_write_only_and_preserved_when_blank_omitted(self):
        result = self.client.put(self.endpoint, self.data, format="json")
        self.assertEqual(result.status_code, 200)
        row = PaymentConfiguration.objects.get()
        self.assertNotIn("stored-secret", row.client_secret_encrypted)
        self.assertNotIn("stored-client", row.client_id_encrypted)
        for method in [lambda: result, lambda: self.client.get(self.endpoint)]:
            self.assertNotIn("stored-secret", str(method().data))
            self.assertNotIn("stored-client", str(method().data))
        data = {k: v for k, v in self.data.items() if k not in {"client_id", "client_secret"}}
        self.assertEqual(self.client.put(self.endpoint, data, format="json").status_code, 200)
        self.assertEqual(gateway.configuration()["client_secret"], "stored-secret")
        self.assertNotIn("stored-secret", str(list(AuditEvent.objects.values())))

    def test_test_connection_creates_no_charges_and_exposes_no_token(self):
        with patch.object(gateway, "authorize", return_value=("unused", "private-token")):
            response = self.client.post(self.endpoint + "test/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("private-token", str(response.data))
        self.assertFalse(BillingCheckout.objects.exists())

    def test_disabled_checkout_still_accepts_confirmed_payments(self):
        self.client.put(self.endpoint, {**self.data, "enabled": False}, format="json")
        self.assertFalse(gateway.configuration()["enabled"])
        # Credentials stay available to notifications even when sales are disabled.
        self.assertEqual(gateway.configuration()["client_secret"], "stored-secret")

    def test_environment_switch_requires_matching_credentials(self):
        data = {k: v for k, v in self.data.items() if k not in {"client_id", "client_secret"}}
        response = self.client.put(self.endpoint, {**data, "sandbox": False}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(PaymentConfiguration.objects.exists())
