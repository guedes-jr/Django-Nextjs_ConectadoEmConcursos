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

