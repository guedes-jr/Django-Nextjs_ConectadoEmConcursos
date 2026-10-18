from django.urls import path
from .views import cancel, expire, plans, stripe_webhook, subscription

urlpatterns = [
    path("plans/", plans),
    path("subscription/", subscription),
    path("subscription/cancel/", cancel),
    path("subscription/checkout/expire/", expire),
    path("billing/stripe/webhook/", stripe_webhook),
]
