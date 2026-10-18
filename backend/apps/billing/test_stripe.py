import hashlib
import hmac
import json
import time
from copy import deepcopy
from datetime import timedelta
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.backoffice.models import AuditEvent
from .models import BillingCheckout, PaymentEvent, Plan, StripeWebhookEvent, Subscription
from .services import user_plan_slug
from . import stripe_gateway as gateway

CONFIG = dict(STRIPE_SECRET_KEY="sk_test_fake", STRIPE_WEBHOOK_SECRET="whsec_fake", STRIPE_LIVE_MODE=False,
              STRIPE_PRICE_IDS={"padrao": {"mensal": "price_month", "anual": "price_year"}})


@override_settings(**CONFIG)
class StripeBillingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("stripe-user", password="password")
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_authenticate(self.user)
        self.plan = Plan.objects.get(slug="padrao")
        self.free = Plan.objects.get(slug="gratis")
        self.now = int(time.time())
        self.attempt = None
        self.network = patch("apps.billing.stripe_gateway.requests.request", side_effect=AssertionError("Unmocked provider request"))
        self.network.start()
        self.addCleanup(self.network.stop)

    def attempt_record(self):
        self.attempt = BillingCheckout.objects.create(user=self.user, plan=self.plan, cycle="mensal", amount_minor=3990, price_id="price_month", session_id="cs_test_checkout")
        return self.attempt

    def provider(self, **extra):
        return {"id": "sub_test", "status": "active", "cancel_at_period_end": False,
                "metadata": {"checkout_id": str(self.attempt.pk)}, **extra}

    def invoice(self, **extra):
        return {"id": "in_test", "parent": {"subscription_details": {"subscription": "sub_test"}}, "status": "paid",
                "amount_paid": 3990, "currency": "brl", "billing_reason": "subscription_create",
                "status_transitions": {"paid_at": self.now},
                "lines": {"has_more": False, "data": [{"pricing": {"price_details": {"price": "price_month"}}, "quantity": 1,
                          "period": {"start": self.now, "end": self.now + 30*86400}}]}, **extra}

    def event(self, kind="invoice.paid", event_id="evt_test", object_id="in_test"):
        return {"id": event_id, "created": self.now, "livemode": False, "type": kind, "data": {"object": {"id": object_id, "customer_email": "private@example.com"}}}

    def deliver(self, event, *, valid=True, age=0):
        body = json.dumps(event).encode()
        stamp = str(int(time.time()) - age)
        signature = hmac.new(b"whsec_fake", stamp.encode()+b"."+body, hashlib.sha256).hexdigest() if valid else "incorrect"
        return APIClient(enforce_csrf_checks=True).post("/api/billing/stripe/webhook/", body, content_type="application/json", HTTP_STRIPE_SIGNATURE=f"t={stamp},v1={signature}")

    def paid(self, invoice=None, provider=None, event_id="evt_test"):
        with patch.object(gateway, "request", side_effect=[invoice or self.invoice(), provider or self.provider()]):
            return self.deliver(self.event(event_id=event_id))

    def test_paid_checkout_preserves_existing_access_and_reuses_attempt(self):
        sub = Subscription.objects.create(user=self.user, plan=self.free, status="active")
        session = {"id": "cs_test_checkout", "status": "open", "url": "https://checkout.stripe.com/c/pay/test", "expires_at": self.now+3600}
        with patch.object(gateway, "create_session", return_value=session) as create:
            first = self.client.post("/api/subscription/", {"plan": "padrao", "cycle": "mensal"})
            second = self.client.post("/api/subscription/", {"plan": "padrao", "cycle": "mensal"})
        self.assertEqual(first.status_code, 202)
        self.assertEqual(first.data["checkout_url"], session["url"])
        self.assertEqual(second.status_code, 202)
        self.assertEqual(create.call_count, 1)
        self.assertEqual(BillingCheckout.objects.count(), 1)
        sub.refresh_from_db()
        self.assertEqual(sub.plan, self.free)
        self.assertEqual(user_plan_slug(self.user), "gratis")
        self.assertNotIn("checkout.stripe.com", str(list(AuditEvent.objects.values("after"))))

    def test_uncertain_gateway_retries_same_attempt(self):
        with patch.object(gateway, "create_session", side_effect=gateway.GatewayUnavailable()) as create:
            for _ in range(2):
                response = self.client.post("/api/subscription/", {"plan": "padrao", "cycle": "mensal"})
                self.assertEqual(response.status_code, 503)
        self.assertEqual(create.call_args_list[0].args[0].pk, create.call_args_list[1].args[0].pk)
        self.assertEqual(BillingCheckout.objects.count(), 1)
        self.assertFalse(Subscription.objects.exists())

    def test_draft_and_cycle_price_validation(self):
        self.plan.status = "draft"
        self.plan.save()
        self.assertEqual(self.client.post("/api/subscription/", {"plan": "padrao", "cycle": "mensal"}).status_code, 404)
        self.plan.status = "published"
        self.plan.monthly_price = 0
        self.plan.save()
        with patch.object(gateway, "create_session", side_effect=gateway.GatewayUnavailable()):
            self.assertEqual(self.client.post("/api/subscription/", {"plan": "padrao", "cycle": "anual"}).status_code, 503)
        self.assertEqual(BillingCheckout.objects.get().amount_minor, 39900)

    def test_price_and_redirect_validation(self):
        attempt = self.attempt_record()
        with patch.object(gateway, "request", return_value={"active": True, "currency": "usd", "unit_amount": 3990}):
            with self.assertRaises(gateway.GatewayUnavailable):
                gateway.validate_price(attempt)
        with patch.object(gateway, "validate_price"), patch.object(gateway, "request", return_value={"id": "cs_bad", "status": "open", "url": "https://checkout.stripe.com.evil.com"}):
            with self.assertRaises(gateway.GatewayUnavailable):
                gateway.create_session(attempt)

    def test_signature_replay_and_environment_rejected(self):
        for response in [self.deliver(self.event(), valid=False), self.deliver(self.event(), age=301), self.deliver({**self.event(), "livemode": True})]:
            self.assertEqual(response.status_code, 400)
        self.assertFalse(StripeWebhookEvent.objects.exists())

    def test_paid_invoice_grants_access_once_and_records_real_amount(self):
        self.attempt_record()
        response = self.paid(invoice=self.invoice(amount_paid=2990))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(user_plan_slug(self.user), "padrao")
        self.assertEqual(PaymentEvent.objects.get().amount_minor, 2990)
        self.assertEqual(PaymentEvent.objects.get().payload, {})
        # A second event for the same invoice is not another payment.
        self.assertEqual(self.paid(event_id="evt_second").status_code, 200)
        self.assertEqual(PaymentEvent.objects.count(), 1)
        with patch.object(gateway, "request") as request:
            self.assertEqual(self.deliver(self.event()).data["outcome"], "duplicate")
            request.assert_not_called()
        self.assertNotIn("private@example.com", str(list(AuditEvent.objects.values())) + str(list(StripeWebhookEvent.objects.values())))

    def test_renewal_and_out_of_order_invoice_do_not_shorten_access(self):
        self.attempt_record()
        self.assertEqual(self.paid().status_code, 200)
        renewed = self.invoice(id="in_renew", billing_reason="subscription_cycle")
        renewed["lines"]["data"][0]["period"] = {"start": self.now+30*86400, "end": self.now+60*86400}
        self.assertEqual(self.paid(invoice=renewed, event_id="evt_renew").status_code, 200)
        self.assertEqual(self.paid(event_id="evt_older").status_code, 200)
        sub = Subscription.objects.get()
        self.assertEqual(int(sub.current_period_end.timestamp()), self.now+60*86400)
        self.assertEqual(PaymentEvent.objects.filter(type=PaymentEvent.Type.RENEWED).count(), 1)
        sub.current_period_end = timezone.now() - timedelta(seconds=1)
        sub.save()
        self.assertEqual(user_plan_slug(self.user), "gratis")
        self.assertFalse(self.client.get("/api/subscription/").data["access_active"])

    def test_checkout_completion_and_provider_active_alone_never_grant_access(self):
        attempt = self.attempt_record()
        with patch.object(gateway, "request", return_value={"id": attempt.session_id, "status": "complete", "metadata": {"checkout_id": str(attempt.pk)}}):
            self.assertEqual(self.deliver(self.event("checkout.session.completed", object_id=attempt.session_id)).status_code, 200)
        with patch.object(gateway, "request", return_value=self.provider()):
            self.assertEqual(self.deliver(self.event("customer.subscription.updated", event_id="evt_update", object_id="sub_test")).status_code, 200)
        self.assertEqual(user_plan_slug(self.user), "gratis")
        self.assertFalse(PaymentEvent.objects.exists())

    def test_canonical_cancellation_wins_over_old_invoice(self):
        self.attempt_record()
        self.assertEqual(self.paid().status_code, 200)
        with patch.object(gateway, "request", return_value=self.provider(status="canceled")):
            response = self.deliver(self.event("customer.subscription.deleted", event_id="evt_cancel", object_id="sub_test"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.paid(event_id="evt_delayed").status_code, 200)
        self.assertEqual(user_plan_slug(self.user), "gratis")
        self.assertEqual(Subscription.objects.get().status, "canceled")

    def test_failure_preserves_paid_period_and_cancel_is_private(self):
        self.attempt_record()
        self.paid()
        failed = self.invoice(id="in_failed", status="open", paid=False)
        with patch.object(gateway, "request", side_effect=[failed, self.provider(status="past_due")]):
            response = self.deliver(self.event("invoice.payment_failed", event_id="evt_fail"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(user_plan_slug(self.user), "padrao")
        other = get_user_model().objects.create_user("other-stripe")
        self.client.force_authenticate(other)
        with patch.object(gateway, "request") as request:
            self.assertEqual(self.client.post("/api/subscription/cancel/").status_code, 409)
            request.assert_not_called()
        self.client.force_authenticate(self.user)
        with patch.object(gateway, "request", return_value=self.provider(cancel_at_period_end=True)):
            self.assertEqual(self.client.post("/api/subscription/cancel/").status_code, 200)
        self.assertTrue(Subscription.objects.get().cancel_at_period_end)
        self.assertEqual(user_plan_slug(self.user), "padrao")
        self.assertEqual(self.client.post("/api/subscription/", {"plan": "gratis", "cycle": "mensal"}).status_code, 409)

    def test_wrong_price_rolls_back_event_and_access(self):
        self.attempt_record()
        invoice = self.invoice()
        invoice["lines"]["data"][0]["pricing"]["price_details"]["price"] = "price_other"
        self.assertEqual(self.paid(invoice=invoice).status_code, 400)
        self.assertFalse(StripeWebhookEvent.objects.exists())
        self.assertFalse(Subscription.objects.exists())

    def test_expire_pending_checkout_must_confirm_provider_expiration(self):
        self.attempt_record()
        with patch.object(gateway, "request", side_effect=[{"status": "open"}, {"status": "expired"}]):
            self.assertEqual(self.client.post("/api/subscription/checkout/expire/").status_code, 200)
        self.assertEqual(BillingCheckout.objects.get().status, "expired")

    def test_adapter_uses_pinned_api_and_idempotency_and_handles_timeout(self):
        attempt = self.attempt_record()
        response = Mock(status_code=200)
        response.json.return_value = {"livemode": False, "id": "ok"}
        with patch("apps.billing.stripe_gateway.requests.request", return_value=response) as request:
            gateway.request("POST", "checkout/sessions", data={"safe": "value"}, key=str(attempt.pk))
            kwargs = request.call_args.kwargs
            self.assertEqual(kwargs["headers"]["Stripe-Version"], gateway.API_VERSION)
            self.assertEqual(kwargs["headers"]["Idempotency-Key"], str(attempt.pk))
            self.assertFalse(kwargs["allow_redirects"])
        import requests
        with patch("apps.billing.stripe_gateway.requests.request", side_effect=requests.Timeout):
            with self.assertRaises(gateway.GatewayUnavailable):
                gateway.request("GET", "prices/price_test")

    def test_confirmation_window_blocks_a_second_checkout(self):
        attempt = self.attempt_record()
        with patch.object(gateway, "request", return_value={"id": attempt.session_id, "status": "complete", "metadata": {"checkout_id": str(attempt.pk)}}):
            self.assertEqual(self.deliver(self.event("checkout.session.completed", object_id=attempt.session_id)).status_code, 200)
        self.assertEqual(BillingCheckout.objects.get().status, "processing")
        with patch.object(gateway, "create_session") as create:
            result = self.client.post("/api/subscription/", {"plan": "padrao", "cycle": "mensal"})
            self.assertEqual(result.status_code, 202)
            self.assertIsNone(result.data["checkout_url"])
            create.assert_not_called()
        self.assertEqual(self.client.post("/api/subscription/", {"plan": "padrao", "cycle": "anual"}).status_code, 409)
        self.assertEqual(self.client.post("/api/subscription/", {"plan": "gratis", "cycle": "mensal"}).status_code, 409)

    def test_invoice_before_checkout_response_and_delayed_completion_do_not_regress(self):
        attempt = self.attempt_record()
        attempt.session_id = ""
        attempt.save()
        self.assertEqual(self.paid().status_code, 200)
        self.assertEqual(Subscription.objects.get().checkout_id, str(attempt.pk))
        with patch.object(gateway, "request", return_value={"id": "cs_test_checkout", "status": "complete", "metadata": {"checkout_id": str(attempt.pk)}}):
            self.assertEqual(self.deliver(self.event("checkout.session.completed", event_id="evt_late_checkout", object_id="cs_test_checkout")).status_code, 200)
        self.assertEqual(BillingCheckout.objects.get().status, "complete")
        # Provider metadata may be removed; the durable local link still resolves.
        with patch.object(gateway, "request", return_value=self.provider(metadata={}, cancel_at_period_end=True)):
            self.assertEqual(self.deliver(self.event("customer.subscription.updated", event_id="evt_metadata_removed", object_id="sub_test")).status_code, 200)
        self.assertTrue(Subscription.objects.get().cancel_at_period_end)

    def test_payment_already_canceled_is_recorded_without_granting_access(self):
        self.attempt_record()
        self.assertEqual(self.paid(provider=self.provider(status="canceled")).status_code, 200)
        self.assertEqual(PaymentEvent.objects.get().amount_minor, 3990)
        self.assertEqual(user_plan_slug(self.user), "gratis")
        self.assertFalse(Subscription.objects.exists())

    def test_extra_invoice_items_and_basil_proration_are_rejected(self):
        self.attempt_record()
        invoice = self.invoice()
        invoice["lines"]["data"][0]["parent"] = {"subscription_item_details": {"proration": True}}
        self.assertEqual(self.paid(invoice=invoice).status_code, 400)
        invoice = self.invoice()
        invoice["lines"]["data"].append(deepcopy(invoice["lines"]["data"][0]))
        self.assertEqual(self.paid(invoice=invoice).status_code, 400)
        self.assertFalse(PaymentEvent.objects.exists())

    def test_admin_cannot_override_provider_or_pending_checkout(self):
        from django.contrib.auth.models import Group
        self.user.is_staff = True
        self.user.save()
        self.user.groups.add(Group.objects.get(name="Administrador"))
        sub = Subscription.objects.create(user=self.user, plan=self.free, status="active")
        attempt = self.attempt_record()
        response = self.client.patch(f"/api/backoffice/subscriptions/{sub.pk}/", {"status": "canceled"})
        self.assertEqual(response.status_code, 409)
        response = self.client.post(f"/api/backoffice/users/{self.user.pk}/subscription/", {"plan": "gratis"})
        self.assertEqual(response.status_code, 409)
        attempt.status = "complete"
        attempt.save()
        sub.gateway = "stripe"
        sub.save()
        self.assertEqual(self.client.patch(f"/api/backoffice/subscriptions/{sub.pk}/", {"status": "active"}).status_code, 409)

    def test_late_provider_update_does_not_undo_requested_cancellation(self):
        self.attempt_record()
        self.paid()
        with patch.object(gateway, "request", return_value=self.provider(cancel_at_period_end=True)):
            self.assertEqual(self.client.post("/api/subscription/cancel/").status_code, 200)
        with patch.object(gateway, "request", return_value=self.provider(cancel_at_period_end=False)):
            self.deliver(self.event("customer.subscription.updated", event_id="evt_stale_cancel", object_id="sub_test"))
        self.assertTrue(Subscription.objects.get().cancel_at_period_end)

    def test_late_old_payment_is_kept_without_replacing_new_subscription(self):
        old = self.attempt_record()
        self.assertEqual(self.paid().status_code, 200)
        sub = Subscription.objects.get()
        sub.provider_status = "canceled"
        sub.status = "canceled"
        sub.save()
        new = BillingCheckout.objects.create(user=self.user, plan=self.plan, cycle="mensal", amount_minor=3990, price_id="price_month", session_id="cs_new")
        self.attempt = new
        self.assertEqual(self.paid(invoice=self.invoice(id="in_new"), provider=self.provider(id="sub_new"), event_id="evt_new").status_code, 200)
        self.attempt = old
        self.assertEqual(self.paid(invoice=self.invoice(id="in_late_old"), provider=self.provider(status="canceled"), event_id="evt_late_old").status_code, 200)
        self.assertEqual(PaymentEvent.objects.count(), 3)
        self.assertEqual(Subscription.objects.get().provider_subscription_id, "sub_new")
        self.assertEqual(BillingCheckout.objects.get(pk=new.pk).status, "complete")

    def test_receipt_retains_plan_and_cycle_snapshot_after_catalog_changes(self):
        self.attempt_record()
        self.assertEqual(self.paid().status_code, 200)
        receipt = PaymentEvent.objects.get()
        self.assertEqual(receipt.plan_slug, "padrao")
        self.assertEqual(receipt.plan_name, self.plan.name)
        self.assertEqual(receipt.billing_cycle, "mensal")
        self.plan.name = "Nome alterado depois do pagamento"
        self.plan.save()
        self.assertEqual(self.paid(event_id="evt_snapshot_duplicate").status_code, 200)
        receipt.refresh_from_db()
        self.assertNotEqual(receipt.plan_name, self.plan.name)
