"""Efí API Cobranças. Hosted checkout includes credit card and Bolix (boleto/Pix)."""
import hashlib
import re
from urllib.parse import urlparse

import requests
from rest_framework.exceptions import ValidationError
from .configuration import current
from .stripe_gateway import GatewayUnavailable

PAYMENT_HOSTS = {"pagamento.gerencianet.com.br", "pagamento.efipay.com.br"}


def fingerprint(config):
    return hashlib.sha256(config["client_id"].encode()).hexdigest()


def configuration():
    config = current()
    if not config["client_id"] or not config["client_secret"]:
        raise GatewayUnavailable("Credenciais da API Cobranças Efí não configuradas.")
    return config


def valid_url(value):
    try:
        url = urlparse(value or "")
        port = url.port
    except (ValueError, TypeError):
        return False
    return (url.scheme == "https" and url.hostname in PAYMENT_HOSTS and not url.username
            and not url.password and port in (None, 443))


def charge_id(value):
    if isinstance(value, bool) or not re.fullmatch(r"[1-9][0-9]{0,19}", str(value)):
        raise ValidationError("Identificador de cobrança Efí inválido.")
    return str(value)


def _http(method, url, **kwargs):
    try:
        response = requests.request(method, url, timeout=(5, 20), allow_redirects=False, **kwargs)
        if not 200 <= response.status_code < 300:
            raise GatewayUnavailable("Não foi possível consultar a Efí. Verifique a configuração ou tente novamente.")
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError
        return data
    except (requests.RequestException, ValueError) as exc:
        raise GatewayUnavailable("Comunicação com a Efí indisponível. Consulte o status antes de tentar novamente.") from exc


def authorize(config=None):
    config = config or configuration()
    base = "https://cobrancas-h.api.efipay.com.br" if config["sandbox"] else "https://cobrancas.api.efipay.com.br"
    result = _http("POST", base + "/v1/authorize", auth=(config["client_id"], config["client_secret"]),
                   json={"grant_type": "client_credentials"})
    token = result.get("access_token")
    if not isinstance(token, str) or not token:
        raise GatewayUnavailable()
    return base, token


def request(method, path, *, data=None, attempt=None):
    config = configuration()
    if attempt and (attempt.sandbox != config["sandbox"] or attempt.price_id != fingerprint(config)):
        raise GatewayUnavailable("Esta cobrança pertence a outra conta ou ambiente Efí. Contate o suporte.")
    base, token = authorize(config)
    result = _http(method, base + "/v1/" + path, json=data, headers={"Authorization": "Bearer " + token})
    if result.get("code") not in (200, 201):
        raise GatewayUnavailable()
    return result.get("data")
