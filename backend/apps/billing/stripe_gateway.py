"""Small Stripe REST adapter; no card data is handled by the application."""
import hashlib
import hmac
import json
import re
import time
from urllib.parse import urlparse

from django.conf import settings
import requests
from rest_framework.exceptions import APIException, ValidationError

API_VERSION = "2025-03-31.basil"


class GatewayUnavailable(APIException):
    status_code = 503
    default_detail = "Pagamento indisponível no momento. Nenhuma confirmação de cobrança foi registrada; tente novamente."


class BillingConflict(APIException):
    status_code = 409
    default_detail = "Já existe uma assinatura ou checkout em andamento."


def configured():
    prefix = ("sk_live_", "rk_live_") if settings.STRIPE_LIVE_MODE else ("sk_test_", "rk_test_")
    return bool(settings.STRIPE_SECRET_KEY.startswith(prefix) and settings.STRIPE_WEBHOOK_SECRET)


def require_gateway():
    if not configured():
        raise GatewayUnavailable("Pagamento ainda não configurado; nenhuma cobrança foi iniciada.")


def stripe_id(value, prefix):
    if isinstance(value, dict):
        value = value.get("id")
    if not isinstance(value, str) or not re.fullmatch(re.escape(prefix)+r"[A-Za-z0-9_]{1,240}", value):
        raise ValidationError("Identificador do provedor inválido.")
    return value


def request(method, path, *, data=None, key=None):
    require_gateway()
    headers = {"Authorization": f"Bearer {settings.STRIPE_SECRET_KEY}", "Stripe-Version": API_VERSION}
    if key:
        headers["Idempotency-Key"] = str(key)
    try:
        response = requests.request(method, "https://api.stripe.com/v1/"+path, data=data, headers=headers,
                                    timeout=(5, 15), allow_redirects=False)
        if not 200 <= response.status_code < 300:
            raise GatewayUnavailable()
        result = response.json()
        if not isinstance(result, dict) or result.get("livemode") is not settings.STRIPE_LIVE_MODE:
            raise GatewayUnavailable()
        return result
    except (requests.RequestException, ValueError) as exc:
        raise GatewayUnavailable() from exc


def validate_price(attempt):
    price = request("GET", "prices/"+stripe_id(attempt.price_id,"price_"))
    interval, count = {"mensal":("month",1),"semestral":("month",6),"anual":("year",1)}[attempt.cycle]
    recurring = price.get("recurring") or {}
    if not (price.get("active") is True and price.get("currency") == attempt.currency and price.get("unit_amount") == attempt.amount_minor
            and recurring.get("interval") == interval and recurring.get("interval_count") == count
            and recurring.get("usage_type", "licensed") == "licensed"):
        raise GatewayUnavailable("Preço do provedor não corresponde ao plano/ciclo publicado. Contate o suporte.")


def create_session(attempt):
    validate_price(attempt)
    data = {
        "mode":"subscription", "line_items[0][price]":attempt.price_id, "line_items[0][quantity]":"1",
        "client_reference_id":str(attempt.pk), "metadata[checkout_id]":str(attempt.pk),
        "subscription_data[metadata][checkout_id]":str(attempt.pk),
        "success_url":settings.FRONTEND_URL+"/plans?checkout=success",
        "cancel_url":settings.FRONTEND_URL+"/plans?checkout=canceled",
        "expires_at":str(int(attempt.created_at.timestamp())+23*3600),
    }
    result = request("POST","checkout/sessions",data=data,key=f"checkout-{attempt.pk}")
    stripe_id(result.get("id"),"cs_")
    url = urlparse(result.get("url") or "")
    if result.get("status") == "open" and (url.scheme != "https" or url.hostname != "checkout.stripe.com" or url.username or url.password):
        raise GatewayUnavailable()
    return result


def verify_event(body, header):
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise GatewayUnavailable("Webhook de pagamento não configurado.")
    if not isinstance(header, str) or len(header)>2048:
        raise ValidationError("Assinatura inválida.")
    values = [part.split("=",1) for part in header.split(",") if "=" in part]
    timestamps = [value for key,value in values if key == "t"]
    try:
        if len(timestamps) != 1 or abs(time.time()-int(timestamps[0]))>300:
            raise ValueError
        expected = hmac.new(settings.STRIPE_WEBHOOK_SECRET.encode(),timestamps[0].encode()+b"."+body,hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected,value) for key,value in values if key == "v1"):
            raise ValueError
        event = json.loads(body)
        if not isinstance(event,dict) or not isinstance(event.get("data"),dict) or not isinstance(event["data"].get("object"),dict):
            raise ValueError
        stripe_id(event.get("id"),"evt_")
        if not isinstance(event.get("type"),str) or len(event["type"])>128 or type(event.get("created")) is not int:
            raise ValueError
        if event.get("livemode") is not settings.STRIPE_LIVE_MODE:
            raise ValueError
        return event
    except (ValueError, TypeError, UnicodeError, RecursionError) as exc:
        raise ValidationError("Assinatura ou evento inválido.") from exc
