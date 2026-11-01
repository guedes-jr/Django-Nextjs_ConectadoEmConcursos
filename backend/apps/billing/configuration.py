"""Runtime payment settings. Credentials never leave the backend."""
from django.conf import settings
from apps.core.email_delivery import decrypt_password
from .models import PaymentConfiguration


def current():
    row = PaymentConfiguration.objects.filter(pk=1).first()
    if row:
        return {"source": "admin", "gateway": row.gateway, "enabled": row.enabled,
                "sandbox": row.sandbox, "client_id": decrypt_password(row.client_id_encrypted) if row.client_id_encrypted else "",
                "client_secret": decrypt_password(row.client_secret_encrypted) if row.client_secret_encrypted else "",
                "notification_url": row.notification_url}
    return {"source": "environment", "gateway": settings.BILLING_GATEWAY, "enabled": True,
            "sandbox": settings.EFI_SANDBOX, "client_id": settings.EFI_CLIENT_ID,
            "client_secret": settings.EFI_CLIENT_SECRET, "notification_url": settings.EFI_NOTIFICATION_URL}
