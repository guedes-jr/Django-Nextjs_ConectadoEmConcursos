"""Prepaid periods, provider-confirmed receipts and replay-safe Efí notifications."""
import calendar
import re
from datetime import timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError
from rest_framework.throttling import AnonRateThrottle

from apps.backoffice.audit import log
from . import efi_gateway as gateway
from .checkout import lock_user, pending_checkout, managed
from .models import BillingCheckout, PaymentEvent, Subscription
from .stripe_gateway import BillingConflict, GatewayUnavailable

TERMINAL = {"canceled", "expired", "refunded", "contested", "unpaid"}


class NotificationThrottle(AnonRateThrottle):
    rate = "120/min"


def period_end(start, cycle):
    months = {"mensal": 1, "semestral": 6, "anual": 12}[cycle]
    month = start.month - 1 + months
    year, month = start.year + month // 12, month % 12 + 1
    return start.replace(year=year, month=month, day=min(start.day, calendar.monthrange(year, month)[1]))


def validate_charge(attempt, charge):
    if (not isinstance(charge, dict) or gateway.charge_id(charge.get("charge_id")) != attempt.session_id
            or charge.get("custom_id") != str(attempt.pk)
            or type(charge.get("total")) is not int or charge["total"] != attempt.amount_minor):
        raise ValidationError("A cobrança Efí não corresponde ao plano contratado.")


def apply_charge(attempt, charge, *, paid_at=None):
    validate_charge(attempt, charge)
    if attempt.sandbox and not settings.DEBUG:
        raise GatewayUnavailable("Uma cobrança de homologação não pode liberar acesso em produção.")
    state = charge.get("status")
    with transaction.atomic():
        lock_user(attempt.user_id)
        attempt.refresh_from_db()
        sub = Subscription.objects.filter(user_id=attempt.user_id).first()
        invoice = f"efi:{'sandbox' if attempt.sandbox else 'live'}:{attempt.price_id}:{attempt.session_id}"
        if state == "paid":
            # A stale paid event must never undo a recorded reversal.
            if PaymentEvent.objects.filter(event_id=invoice + ":reversed").exists():
                return
            receipt = PaymentEvent.objects.filter(invoice_id=invoice, type__in=["payment.succeeded", "subscription.renewed"]).first()
            if not receipt:
                start = timezone.now()
                end = period_end(start, attempt.cycle)
                # A canceled boleto may still be paid later. Preserve newer access
                # and record the payment for support rather than replace its plan.
                overlap = bool(sub and sub.status == "active" and sub.current_period_end and sub.current_period_end > start)
                if not overlap:
                    sub, _ = Subscription.objects.update_or_create(user_id=attempt.user_id, defaults={
                        "plan_id": attempt.plan_id, "cycle": attempt.cycle, "status": "active", "gateway": "efi",
                        "checkout_id": str(attempt.pk), "provider_subscription_id": "", "provider_status": "paid",
                        "provider_price_id": "", "price_amount_minor": attempt.amount_minor, "currency": "brl",
                        "current_period_end": end, "cancel_at_period_end": False,
                    })
                PaymentEvent.objects.create(event_id=invoice + ":paid", invoice_id=invoice,
                    type=PaymentEvent.Type.RENEWED if sub and sub.events.filter(type__in=["payment.succeeded", "subscription.renewed"]).exists() else PaymentEvent.Type.SUCCEEDED,
                    subscription=sub, user_id=attempt.user_id, amount_minor=attempt.amount_minor, currency="brl",
                    plan_slug=attempt.plan.slug, plan_name=attempt.plan.name, billing_cycle=attempt.cycle,
                    paid_at=paid_at or start, period_start=None if overlap else start, period_end=None if overlap else end)
                log(action="billing.efi_payment_confirmed", resource_type="billing_checkout", resource_id=attempt.pk,
                    after={"amount_minor": attempt.amount_minor, "sandbox": attempt.sandbox, "requires_reconciliation": overlap})
            attempt.status = "complete"
            attempt.checkout_url = ""
        elif state in {"refunded", "contested"}:
            PaymentEvent.objects.get_or_create(event_id=invoice + ":reversed", defaults={
                "type": PaymentEvent.Type.CANCELED, "user_id": attempt.user_id, "subscription": sub})
            if sub and sub.gateway == "efi" and sub.checkout_id == str(attempt.pk):
                sub.status, sub.provider_status = "canceled", state
                sub.save(update_fields=["status", "provider_status", "updated_at"])
            attempt.status, attempt.checkout_url = "expired", ""
            log(action="billing.efi_payment_reversed", resource_type="billing_checkout", resource_id=attempt.pk, after={"status": state})
        elif attempt.status != "complete":
            if state in TERMINAL:
                attempt.status, attempt.checkout_url = "expired", ""
            elif state in {"waiting", "approved", "identified", "in_analysis", "settled"}:
                # approved/settled are not confirmation of money received.
                attempt.status = "processing"
        attempt.save(update_fields=["status", "checkout_url"])


def refresh(attempt):
    if not attempt.session_id:
        raise BillingConflict("Cobrança em criação ou com resposta incerta. Aguarde a notificação ou contate o suporte; não crie outra cobrança.")
    charge = gateway.request("GET", "charge/" + gateway.charge_id(attempt.session_id), attempt=attempt)
    apply_charge(attempt, charge)
    attempt.refresh_from_db()
    return charge


def select_plan(user, plan, cycle, minor):
    config = gateway.configuration()
    if not config["enabled"]:
        raise GatewayUnavailable("Novas cobranças estão desativadas.")
    if config["sandbox"] and not settings.DEBUG:
        raise GatewayUnavailable("Cobranças de homologação são permitidas apenas em ambiente de desenvolvimento.")
    url = config["notification_url"]
    if not url.startswith("https://"):
        raise GatewayUnavailable("Configure uma URL HTTPS pública para as notificações Efí.")
    with transaction.atomic():
        lock_user(user.pk)
        sub = Subscription.objects.filter(user=user).first()
        attempt = pending_checkout(user.pk)
        if managed(sub) or (sub and sub.status == "active" and sub.current_period_end and sub.current_period_end > timezone.now()):
            raise BillingConflict("Seu período pago ainda está vigente. Faça uma nova compra quando ele terminar.")
        if attempt:
            if attempt.gateway != "efi" or attempt.plan_id != plan.pk or attempt.cycle != cycle:
                raise BillingConflict("Encerre a cobrança pendente antes de escolher outro plano.")
            created = False
        else:
            attempt = BillingCheckout.objects.create(user=user, plan=plan, cycle=cycle, amount_minor=minor,
                gateway="efi", sandbox=config["sandbox"], price_id=gateway.fingerprint(config))
            created = True
    if not created:
        refresh(attempt)
        return Subscription.objects.filter(user=user).first(), attempt
    # Never retry a creation automatically: this API does not promise idempotency.
    # On timeout the durable attempt stays creating; notification custom_id recovers it.
    expiry = timezone.localdate() + timedelta(days=3)
    result = gateway.request("POST", "charge/one-step/link", attempt=attempt, data={
        "items": [{"name": f"{plan.name} - {cycle}"[:255], "value": minor, "amount": 1}],
        "metadata": {"custom_id": str(attempt.pk), "notification_url": url},
        "settings": {"payment_method": "all", "expire_at": expiry.isoformat(), "request_delivery_address": False},
    })
    if not isinstance(result, dict):
        raise GatewayUnavailable()
    identifier = gateway.charge_id(result.get("charge_id"))
    payment_url = result.get("payment_url")
    if not gateway.valid_url(payment_url):
        raise GatewayUnavailable("A Efí retornou um endereço de pagamento inválido.")
    with transaction.atomic():
        lock_user(user.pk)
        attempt.refresh_from_db()
        if attempt.session_id and attempt.session_id != identifier:
            raise ValidationError("Identificador de cobrança divergente.")
        attempt.session_id = identifier
        validate_charge(attempt, result)
        if attempt.status == "creating":
            attempt.status, attempt.checkout_url = "open", payment_url
        attempt.save(update_fields=["session_id", "status", "checkout_url"])
        log(action="billing.efi_checkout_prepared", resource_type="billing_checkout", resource_id=attempt.pk,
            after={"plan": plan.slug, "cycle": cycle, "sandbox": attempt.sandbox})
    return Subscription.objects.filter(user=user).first(), attempt


def expire(attempt):
    charge = refresh(attempt)
    if attempt.status == "complete":
        raise BillingConflict("Pagamento já confirmado. Seu período pago permanece ativo.")
    if charge["status"] in {"new", "link", "waiting", "unpaid"}:
        gateway.request("PUT", f"charge/{attempt.session_id}/cancel", attempt=attempt)
        refresh(attempt)
    if attempt.status != "expired":
        raise BillingConflict("Pagamento em processamento. Aguarde a confirmação da Efí.")


def process_notification(token):
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", token):
        raise ValidationError("Token de notificação inválido.")
    events = gateway.request("GET", "notification/" + token)
    if not isinstance(events, list) or not events or len(events) > 1000:
        raise ValidationError("Notificação Efí inválida.")
    # Fetch canonical charge, never trust the incoming POST or a historical status.
    latest = {}
    for event in events:
        if event.get("type") == "charge":
            identifier = gateway.charge_id(event.get("identifiers", {}).get("charge_id"))
            latest[identifier] = event
    for identifier, event in latest.items():
        try:
            attempt_id = UUID(str(event.get("custom_id")))
        except ValueError:
            continue
        attempt = BillingCheckout.objects.select_related("plan").filter(pk=attempt_id, gateway="efi").first()
        if not attempt:
            continue
        charge = gateway.request("GET", "charge/" + identifier, attempt=attempt)
        if not attempt.session_id:
            # Recovery of uncertain creation is bound by canonical custom_id and total.
            attempt.session_id = identifier
            validate_charge(attempt, charge)
            with transaction.atomic():
                lock_user(attempt.user_id)
                locked = BillingCheckout.objects.select_for_update().get(pk=attempt.pk)
                if locked.session_id and locked.session_id != identifier:
                    raise ValidationError("Identificador de cobrança divergente.")
                locked.session_id = identifier
                locked.save(update_fields=["session_id"])
        date = None
        for paid_event in events:
            if (paid_event.get("identifiers", {}).get("charge_id") == int(identifier)
                    and paid_event.get("status", {}).get("current") == "paid"):
                date = parse_datetime(paid_event.get("created_at", ""))
                if date and timezone.is_naive(date):
                    date = timezone.make_aware(date, ZoneInfo("America/Sao_Paulo"))
                break
        apply_charge(attempt, charge, paid_at=date)
    return "processed"
