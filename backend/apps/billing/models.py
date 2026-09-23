from django.conf import settings
from django.db import models


class Plan(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=80)
    monthly_price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    semiannual_price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    annual_price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    features = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class Subscription(models.Model):
    class Gateway(models.TextChoices):
        LOCAL = "local", "Local"
        STRIPE = "stripe", "Stripe"
    class Cycle(models.TextChoices):
        MONTHLY = "mensal", "Mensal"
        SEMIANNUAL = "semestral", "Semestral"
        ANNUAL = "anual", "Anual"

    class Status(models.TextChoices):
        ACTIVE = "active", "Ativa"
        PENDING = "pending_payment", "Pagamento pendente"
        CANCELED = "canceled", "Cancelada"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscription")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    cycle = models.CharField(max_length=10, choices=Cycle.choices, default=Cycle.MONTHLY)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    gateway = models.CharField(max_length=20, choices=Gateway.choices, default=Gateway.LOCAL)
    checkout_id = models.CharField(max_length=64, blank=True, default="")
    provider_subscription_id = models.CharField(max_length=64, blank=True, default="")
    current_period_end = models.DateTimeField(null=True, blank=True)



class PaymentEvent(models.Model):
    class Type(models.TextChoices):
        SUCCEEDED = "payment.succeeded", "Pagamento confirmado"
        FAILED = "payment.failed", "Pagamento recusado"
        CANCELED = "subscription.canceled", "Assinatura cancelada"
        RENEWED = "subscription.renewed", "Subscricao renovada"

    event_id = models.CharField(max_length=128, unique=True)
    type = models.CharField(max_length=40, choices=Type.choices)
    subscription = models.ForeignKey(
        Subscription, null=True, blank=True, on_delete=models.SET_NULL, related_name="events"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    payload = models.JSONField(default=dict)
    processed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
