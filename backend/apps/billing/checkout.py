"""Checkout orchestration. External requests never run inside database locks."""
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.backoffice.audit import log
from . import stripe_gateway as gateway
from .models import BillingCheckout, Subscription


def timestamp(value):
    if type(value) is not int or value <= 0:
        raise ValidationError("Período do provedor inválido.")
    try:
        return datetime.fromtimestamp(value, dt_timezone.utc)
    except (ValueError, OverflowError, OSError) as exc:
        raise ValidationError("Período do provedor inválido.") from exc


def lock_user(user_id):
    return get_user_model().objects.select_for_update().get(pk=user_id)


def pending_checkout(user_id):
    return BillingCheckout.objects.filter(user_id=user_id, status__in=["creating", "open", "processing"]).first()


def managed(subscription):
    return bool(subscription and subscription.gateway == "stripe" and subscription.provider_subscription_id
                and subscription.provider_status not in {"canceled", "incomplete_expired"})


def select_plan(user, plan, cycle, *, request=None):
    amount = getattr(plan, {"mensal": "monthly_price", "semestral": "semiannual_price", "anual": "annual_price"}[cycle])
    if amount < 0:
        raise ValidationError("Preço de plano inválido.")
    minor = int(amount * Decimal(100))
    with transaction.atomic():
        lock_user(user.pk)
        sub = Subscription.objects.filter(user=user).first()
        attempt = pending_checkout(user.pk)
        if managed(sub):
            raise gateway.BillingConflict("A assinatura atual é gerenciada pelo provedor. Cancele a renovação antes de contratar outro plano após o encerramento.")
        if sub and sub.gateway == "stripe" and sub.current_period_end and sub.current_period_end > timezone.now() and sub.status == "active":
            raise gateway.BillingConflict("Aguarde o término do período pago para contratar outro plano.")
        if attempt and (attempt.plan_id != plan.pk or attempt.cycle != cycle or not minor):
            raise gateway.BillingConflict("Há um checkout pendente. Encerre-o antes de escolher outro plano.")
        if not minor:
            sub, _ = Subscription.objects.update_or_create(user=user, defaults={
                "plan": plan, "cycle": cycle, "status": "active", "gateway": "local", "checkout_id": "",
                "provider_subscription_id": "", "provider_status": "", "provider_price_id": "",
                "price_amount_minor": 0, "currency": "brl", "current_period_end": None, "cancel_at_period_end": False,
            })
            log(request, actor=user, action="subscription.free_selected", resource_type="subscription", resource_id=sub.pk, after={"plan": plan.slug, "cycle": cycle})
            return sub, None
        gateway.require_gateway()
        if attempt is None:
            price_id = settings.STRIPE_PRICE_IDS.get(plan.slug, {}).get(cycle, "")
            if not price_id:
                raise gateway.GatewayUnavailable("Preço do plano ainda não configurado para este ciclo.")
            gateway.stripe_id(price_id, "price_")
            attempt = BillingCheckout.objects.create(user=user, plan=plan, cycle=cycle, amount_minor=minor, price_id=price_id)
    if attempt.status == "open" and attempt.expires_at and attempt.expires_at > timezone.now():
        return sub, attempt
    if attempt.status == "processing":
        return sub, attempt
    # Retrying the same durable attempt keeps Stripe's original idempotency key.
    if attempt.session_id:
        session = gateway.request("GET", "checkout/sessions/" + gateway.stripe_id(attempt.session_id, "cs_"))
    else:
        if (timezone.now() - attempt.created_at).total_seconds() > 23 * 3600:
            raise gateway.BillingConflict("Checkout antigo requer reconciliação pelo suporte antes de uma nova tentativa.")
        session = gateway.create_session(attempt)
    with transaction.atomic():
        lock_user(user.pk)
        attempt.refresh_from_db()
        attempt.session_id = gateway.stripe_id(session.get("id"), "cs_")
        if attempt.status in {"creating", "open"}:
            attempt.status = {"open": "open", "complete": "processing", "expired": "expired"}.get(session.get("status"))
            if not attempt.status:
                raise gateway.GatewayUnavailable()
            attempt.checkout_url = session.get("url") or ""
            attempt.expires_at = timestamp(session["expires_at"])
            attempt.save()
            log(request, actor=user, action="billing.checkout_prepared", resource_type="billing_checkout", resource_id=attempt.pk, after={"status": attempt.status, "plan": plan.slug, "cycle": cycle})
        attempt.save(update_fields=["session_id", "updated_at"])
        sub = Subscription.objects.filter(user=user).first()
    return sub, attempt


def expire_checkout(user, *, request=None):
    attempt = pending_checkout(user.pk)
    if not attempt:
        return
    if not attempt.session_id:
        # Recover an uncertain create with the very same idempotency key first.
        if (timezone.now() - attempt.created_at).total_seconds() > 23 * 3600:
            raise gateway.BillingConflict("Checkout antigo requer reconciliação pelo suporte.")
        session = gateway.create_session(attempt)
        attempt.session_id = gateway.stripe_id(session.get("id"), "cs_")
    session = gateway.request("GET", "checkout/sessions/" + gateway.stripe_id(attempt.session_id, "cs_"))
    if session.get("status") == "open":
        session = gateway.request("POST", "checkout/sessions/" + attempt.session_id + "/expire", key=f"expire-{attempt.pk}")
    if session.get("status") != "expired":
        raise gateway.BillingConflict("O checkout já foi concluído. Aguarde a confirmação do pagamento.")
    with transaction.atomic():
        lock_user(user.pk)
        BillingCheckout.objects.filter(pk=attempt.pk, status__in=["creating", "open", "processing"]).update(status="expired", checkout_url="", session_id=attempt.session_id)
        log(request, actor=user, action="billing.checkout_expired", resource_type="billing_checkout", resource_id=attempt.pk)


def cancel_subscription(user, *, request=None):
    sub = Subscription.objects.filter(user=user).first()
    if not managed(sub):
        raise gateway.BillingConflict("Não há renovação automática para cancelar.")
    provider_id = gateway.stripe_id(sub.provider_subscription_id, "sub_")
    result = gateway.request("POST", "subscriptions/" + provider_id,
                             data={"cancel_at_period_end": "true"}, key=f"cancel-{sub.pk}-{provider_id}-{sub.current_period_end}")
    if result.get("cancel_at_period_end") is not True:
        raise gateway.GatewayUnavailable()
    with transaction.atomic():
        lock_user(user.pk)
        sub.refresh_from_db()
        if sub.provider_subscription_id != provider_id:
            raise gateway.BillingConflict()
        sub.cancel_at_period_end = True
        sub.save(update_fields=["cancel_at_period_end", "updated_at"])
        log(request, actor=user, action="subscription.cancellation_scheduled", resource_type="subscription", resource_id=sub.pk, after={"current_period_end": sub.current_period_end})
    return sub
