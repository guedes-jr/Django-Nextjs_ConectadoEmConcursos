"""Superuser-only payment configuration; write-only encrypted Efí credentials."""
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.billing.configuration import current
from apps.billing.models import BillingCheckout, PaymentConfiguration, Subscription
from apps.billing import efi_gateway
from apps.core.email_delivery import encrypt_password
from .audit import log
from .permissions import SuperuserAccess


class ConfigurationInput(serializers.Serializer):
    gateway = serializers.ChoiceField(choices=["efi", "stripe"])
    enabled = serializers.BooleanField()
    sandbox = serializers.BooleanField()
    notification_url = serializers.URLField(max_length=600, allow_blank=True)
    client_id = serializers.CharField(max_length=512, required=False, write_only=True)
    client_secret = serializers.CharField(max_length=1024, required=False, write_only=True)


def public(config):
    return {key: config[key] for key in ["source", "gateway", "enabled", "sandbox", "notification_url"]} | {
        "has_client_id": bool(config["client_id"]), "has_client_secret": bool(config["client_secret"]),
        "methods": ["pix", "boleto", "credit_card"], "renewal": "manual",
    }


@api_view(["GET", "PUT"])
@permission_classes([SuperuserAccess])
def payment_configuration(request):
    if request.method == "GET":
        return Response(public(current()))
    serializer = ConfigurationInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    with transaction.atomic():
        # Serialize settings updates on a stable singleton.
        fallback = current()
        row, created = PaymentConfiguration.objects.get_or_create(pk=1)
        row = PaymentConfiguration.objects.select_for_update().get(pk=row.pk)
        old = fallback if created else current()
        client_id = data.get("client_id", old["client_id"])
        secret = data.get("client_secret", old["client_secret"])
        changing_account = data["sandbox"] != old["sandbox"] or client_id != old["client_id"]
        if changing_account:
            pending = BillingCheckout.objects.filter(gateway="efi", status__in=["creating", "open", "processing"]).exists()
            active = Subscription.objects.filter(gateway="efi", status="active", current_period_end__gt=timezone.now()).exists()
            if pending or active:
                raise serializers.ValidationError({"detail": "Não troque a conta/ambiente enquanto houver cobranças pendentes ou períodos Efí vigentes."})
            if not data.get("client_id") or not data.get("client_secret"):
                raise serializers.ValidationError({"detail": "Ao trocar a conta ou ambiente, informe as duas credenciais correspondentes."})
        if data["enabled"] and data["gateway"] == "efi":
            if not client_id or not secret or not data["notification_url"].startswith("https://"):
                raise serializers.ValidationError({"detail": "Para habilitar a Efí, informe as credenciais da API Cobranças e a URL HTTPS de notificação."})
        row.gateway, row.enabled, row.sandbox = data["gateway"], data["enabled"], data["sandbox"]
        row.notification_url = data["notification_url"]
        row.client_id_encrypted, row.client_secret_encrypted = encrypt_password(client_id), encrypt_password(secret)
        row.updated_by = request.user
        row.save()
        log(request, action="settings.payment_updated", resource_type="payment_configuration", resource_id=row.pk,
            after={"gateway": row.gateway, "enabled": row.enabled, "sandbox": row.sandbox})
    return Response(public(current()))


@api_view(["POST"])
@permission_classes([SuperuserAccess])
def payment_test(request):
    # Authentication only: never create a real charge during a connection test.
    efi_gateway.authorize()
    log(request, action="settings.payment_tested", resource_type="payment_configuration", resource_id=1,
        after={"gateway": "efi", "sandbox": current()["sandbox"]})
    return Response({"detail": "Conexão com a API Cobranças Efí validada. Nenhuma cobrança foi criada."})
