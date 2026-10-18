"""Signed Stripe events, canonical provider state and idempotent receipts."""
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.backoffice.audit import log
from . import stripe_gateway as gateway
from .checkout import lock_user, timestamp
from .models import BillingCheckout, PaymentEvent, StripeWebhookEvent, Subscription

SUPPORTED = {"checkout.session.completed", "checkout.session.expired", "invoice.paid", "invoice.payment_failed",
             "customer.subscription.updated", "customer.subscription.deleted"}
TERMINAL = {"canceled", "incomplete_expired"}


def subscription_id(invoice):
    return gateway.stripe_id(invoice.get("subscription") or (invoice.get("parent") or {}).get("subscription_details", {}).get("subscription"), "sub_")


def checkout_for(provider):
    value = (provider.get("metadata") or {}).get("checkout_id")
    try:
        attempt_id = UUID(value) if isinstance(value, str) else None
    except ValueError:
        attempt_id = None
    attempt = BillingCheckout.objects.select_related("plan").filter(pk=attempt_id).first() if attempt_id else None
    if not attempt:
        sub = Subscription.objects.filter(provider_subscription_id=provider["id"]).first()
        if sub and sub.checkout_id:
            attempt = linked_checkout(sub)
    return attempt


def linked_checkout(sub):
    # New subscriptions retain the durable attempt ID, including when the invoice
    # arrives before the Checkout HTTP response. Accept legacy session IDs too.
    query = Q(session_id=sub.checkout_id)
    try:
        query |= Q(pk=UUID(sub.checkout_id))
    except (ValueError, TypeError, AttributeError):
        pass
    return BillingCheckout.objects.filter(query, user_id=sub.user_id).first()


def sync_status(sub, provider):
    # Deletion is terminal for a provider ID; delayed updates cannot resurrect it.
    if sub.provider_status not in TERMINAL:
        sub.provider_status = provider.get("status", "")
    sub.cancel_at_period_end = sub.cancel_at_period_end or provider.get("cancel_at_period_end") is True
    if sub.provider_status in TERMINAL:
        sub.status = Subscription.Status.CANCELED
    elif sub.provider_status in {"active", "past_due"} and sub.current_period_end and sub.current_period_end > timezone.now():
        sub.status = Subscription.Status.ACTIVE
    else:
        sub.status = Subscription.Status.PENDING


def invoice_period(invoice, attempt):
    lines = invoice.get("lines") or {}
    if lines.get("has_more") or not isinstance(lines.get("data"), list) or len(lines["data"]) != 1:
        raise ValidationError("Fatura requer reconciliação: linhas incompletas.")
    matches = []
    for line in lines["data"]:
        price = line.get("price") or (line.get("pricing") or {}).get("price_details", {}).get("price")
        price_id = price.get("id") if isinstance(price, dict) else price
        proration = line.get("proration") or (line.get("parent") or {}).get("subscription_item_details", {}).get("proration", False)
        if price_id == attempt.price_id and type(line.get("quantity")) is int and line["quantity"] == 1 and not proration:
            period = line.get("period") or {}
            start, end = timestamp(period.get("start")), timestamp(period.get("end"))
            if end <= start:
                raise ValidationError("Período de fatura inválido.")
            matches.append((start, end))
    if len(matches) != 1:
        raise ValidationError("Preço ou período da fatura não corresponde ao checkout.")
    return matches[0]


def process_event(event):
    if StripeWebhookEvent.objects.filter(event_id=event["id"]).exists():
        return "duplicate"
    kind = event["type"]
    obj = event["data"]["object"]
    invoice = provider = session = attempt = None
    if kind.startswith("invoice.") and kind in SUPPORTED:
        invoice = gateway.request("GET", "invoices/" + gateway.stripe_id(obj.get("id"), "in_"))
        # Standalone invoices on the same Stripe account are outside this application.
        ref = invoice.get("subscription") or (invoice.get("parent") or {}).get("subscription_details", {}).get("subscription")
        if ref:
            provider = gateway.request("GET", "subscriptions/" + subscription_id(invoice))
            attempt = checkout_for(provider)
    elif kind.startswith("customer.subscription.") and kind in SUPPORTED:
        provider = gateway.request("GET", "subscriptions/" + gateway.stripe_id(obj.get("id"), "sub_"))
        attempt = checkout_for(provider)
    elif kind.startswith("checkout.session.") and kind in SUPPORTED:
        session = gateway.request("GET", "checkout/sessions/" + gateway.stripe_id(obj.get("id"), "cs_"))
        try:
            attempt = BillingCheckout.objects.filter(pk=UUID((session.get("metadata") or {}).get("checkout_id", ""))).first()
        except (ValueError, TypeError, AttributeError):
            attempt = None
    if provider:
        gateway.stripe_id(provider.get("id"), "sub_")
        if provider.get("status") not in {"incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"}:
            raise ValidationError("Estado de assinatura inválido.")
    with transaction.atomic():
        if attempt:
            lock_user(attempt.user_id)
            attempt.refresh_from_db()
        receipt, created = StripeWebhookEvent.objects.get_or_create(event_id=event["id"], defaults={
            "event_type": kind, "object_id": str(obj.get("id", ""))[:255], "outcome": "ignored"})
        if not created:
            return "duplicate"
        if not attempt:
            return "ignored"
        if session:
            if attempt.session_id and attempt.session_id != session["id"]:
                raise ValidationError("Checkout não corresponde à tentativa.")
            attempt.session_id = session["id"]
            if attempt.status in {"creating", "open", "processing"} and session.get("status") in {"complete", "expired"}:
                attempt.status = "processing" if session["status"] == "complete" else "expired"
                attempt.checkout_url = ""
            attempt.save()
            # Completing a checkout alone never grants paid access.
            receipt.outcome = "processed"
            receipt.save(update_fields=["outcome"])
            return "processed"
        payment = None
        if kind == "invoice.paid":
            if invoice.get("status") != "paid" or invoice.get("currency") != attempt.currency or invoice.get("billing_reason") not in {"subscription_create", "subscription_cycle"}:
                raise ValidationError("Fatura sem confirmação de pagamento.")
            amount = invoice.get("amount_paid")
            if type(amount) is not int or amount < 0:
                raise ValidationError("Valor pago inválido.")
            start, end = invoice_period(invoice, attempt)
            paid_at = timestamp((invoice.get("status_transitions") or {}).get("paid_at"))
            payment, fresh = PaymentEvent.objects.get_or_create(invoice_id=invoice["id"], type__in=[PaymentEvent.Type.SUCCEEDED, PaymentEvent.Type.RENEWED], defaults={
                "event_id": event["id"], "type": PaymentEvent.Type.SUCCEEDED if invoice.get("billing_reason") == "subscription_create" else PaymentEvent.Type.RENEWED,
                "user_id": attempt.user_id, "amount_minor": amount, "currency": attempt.currency,
                "plan_slug": attempt.plan.slug, "plan_name": attempt.plan.name, "billing_cycle": attempt.cycle,
                "paid_at": paid_at, "period_start": start, "period_end": end, "provider_created_at": timestamp(event["created"]),
            })
            if fresh:
                log(action="billing.payment_confirmed", resource_type="payment_event", resource_id=payment.pk,
                    after={"amount_minor": amount, "currency": attempt.currency, "period_end": end}, context={"origin": "webhook"})
        if BillingCheckout.objects.filter(user_id=attempt.user_id, status="complete", created_at__gt=attempt.created_at).exists():
            return "ignored"
        sub = Subscription.objects.filter(user_id=attempt.user_id).first()
        if provider.get("status") in TERMINAL and (not sub or sub.provider_subscription_id != provider["id"]):
            if attempt.status in {"creating", "open", "processing"}:
                attempt.status = "expired"
                attempt.checkout_url = ""
                attempt.save()
            return "ignored"
        if sub and sub.provider_subscription_id and sub.provider_subscription_id != provider["id"]:
            # Only a new paid invoice from a subsequent checkout can replace an old ID.
            if kind != "invoice.paid" or (sub.created_at > attempt.created_at) or sub.provider_status not in TERMINAL:
                return "ignored"
            # Older attempts must never replace a more recent subscription.
            previous = linked_checkout(sub)
            if previous and previous.created_at >= attempt.created_at:
                return "ignored"
            sub = None
        if kind == "invoice.paid":
            if sub is None:
                sub, _ = Subscription.objects.update_or_create(user_id=attempt.user_id, defaults={
                    "plan": attempt.plan, "cycle": attempt.cycle, "gateway": "stripe", "status": "pending_payment",
                    "provider_subscription_id": provider["id"], "provider_status": "", "current_period_end": None, "cancel_at_period_end": False,
                })
            # A local/free subscription is replaced only after a verified paid invoice.
            if not sub.provider_subscription_id:
                sub.current_period_end = None
                sub.provider_status = ""
            sub.plan_id, sub.cycle, sub.gateway = attempt.plan_id, attempt.cycle, "stripe"
            sub.provider_subscription_id = provider["id"]
            sub.checkout_id = str(attempt.pk)
            sub.provider_price_id, sub.price_amount_minor, sub.currency = attempt.price_id, attempt.amount_minor, attempt.currency
            sub.current_period_end = max(sub.current_period_end, end) if sub.current_period_end else end
            sync_status(sub, provider)
            sub.save()
            if payment.subscription_id is None:
                payment.subscription = sub
                payment.save(update_fields=["subscription"])
            attempt.status = "complete"
            attempt.checkout_url = ""
            attempt.save()
        elif sub and sub.provider_subscription_id == provider["id"]:
            sync_status(sub, provider)
            sub.save()
            if kind == "invoice.payment_failed" and invoice.get("status") != "paid":
                PaymentEvent.objects.get_or_create(event_id=event["id"], defaults={"type": PaymentEvent.Type.FAILED,
                    "subscription": sub, "user_id": attempt.user_id, "invoice_id": invoice["id"], "provider_created_at": timestamp(event["created"])})
            elif sub.provider_status in TERMINAL:
                PaymentEvent.objects.get_or_create(event_id="canceled-" + provider["id"], defaults={"type": PaymentEvent.Type.CANCELED,
                    "subscription": sub, "user_id": attempt.user_id, "provider_created_at": timestamp(event["created"])})
            log(action="billing.subscription_synced", resource_type="subscription", resource_id=sub.pk,
                after={"status": sub.status, "cancel_at_period_end": sub.cancel_at_period_end}, context={"origin": "webhook"})
        receipt.outcome = "processed"
        receipt.save(update_fields=["outcome"])
        return "processed"
