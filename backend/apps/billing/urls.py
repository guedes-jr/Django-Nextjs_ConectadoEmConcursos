from django.urls import path
from .views import cancel, expire, plans, stripe_webhook, subscription, efi_notification

urlpatterns = [
    path("billing/efi/notifications/", efi_notification),
    path("plans/", plans),
    path("subscription/", subscription),
    path("subscription/cancel/", cancel),
    path("subscription/checkout/expire/", expire),
    path("billing/stripe/webhook/", stripe_webhook),
]
