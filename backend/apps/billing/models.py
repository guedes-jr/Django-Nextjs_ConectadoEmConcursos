import uuid

from django.conf import settings
from django.db import models


class Plan(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        PUBLISHED = "published", "Publicado"
        ARCHIVED = "archived", "Arquivado"

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=80)
    monthly_price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    semiannual_price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    annual_price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    features = models.JSONField(default=list)
    description = models.CharField(max_length=240, blank=True, default="")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PUBLISHED)
    is_highlighted = models.BooleanField(default=False)
    trial_days = models.PositiveSmallIntegerField(default=0)
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
    checkout_id = models.CharField(max_length=255, blank=True, default="")
    provider_subscription_id = models.CharField(max_length=255, blank=True, default="")
    current_period_end = models.DateTimeField(null=True, blank=True)
    provider_status = models.CharField(max_length=32, blank=True, default="")
    provider_price_id = models.CharField(max_length=255, blank=True, default="")
    price_amount_minor = models.PositiveBigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default="brl")
    cancel_at_period_end = models.BooleanField(default=False)


class PaymentEvent(models.Model):
    class Type(models.TextChoices):
        SUCCEEDED = "payment.succeeded", "Pagamento confirmado"
        FAILED = "payment.failed", "Pagamento recusado"
        CANCELED = "subscription.canceled", "Assinatura cancelada"
        RENEWED = "subscription.renewed", "Subscricao renovada"

    event_id = models.CharField(max_length=255, unique=True)
    type = models.CharField(max_length=40, choices=Type.choices)
    subscription = models.ForeignKey(
        Subscription, null=True, blank=True, on_delete=models.SET_NULL, related_name="events"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    invoice_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    amount_minor = models.PositiveBigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, blank=True, default="")
    plan_slug = models.SlugField(blank=True, default="")
    plan_name = models.CharField(max_length=80, blank=True, default="")
    billing_cycle = models.CharField(max_length=10, blank=True, default="", choices=Subscription.Cycle.choices)
    paid_at = models.DateTimeField(null=True, blank=True)
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    provider_created_at = models.DateTimeField(null=True, blank=True)
    payload = models.JSONField(default=dict)
    processed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["type", "processed", "paid_at"], name="billing_paid_report_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["invoice_id"],
                condition=models.Q(type__in=["payment.succeeded", "subscription.renewed"]) & ~models.Q(invoice_id=""),
                name="one_paid_receipt_per_invoice",
            )
        ]


class BillingCheckout(models.Model):
    class Status(models.TextChoices):
        CREATING = "creating", "Preparando checkout"
        OPEN = "open", "Aguardando pagamento"
        PROCESSING = "processing", "Aguardando confirmação"
        COMPLETE = "complete", "Concluído"
        EXPIRED = "expired", "Expirado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="billing_checkouts")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    cycle = models.CharField(max_length=10, choices=Subscription.Cycle.choices)
    amount_minor = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="brl")
    price_id = models.CharField(max_length=255)
    session_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    checkout_url = models.URLField(max_length=2048, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CREATING)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user"], condition=models.Q(status__in=["creating", "open", "processing"]),
                name="one_open_checkout_per_user",
            )
        ]


class StripeWebhookEvent(models.Model):
    event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=128)
    object_id = models.CharField(max_length=255)
    processed_at = models.DateTimeField(auto_now_add=True)
    outcome = models.CharField(max_length=32)
