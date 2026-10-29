from rest_framework import serializers
from apps.billing.models import Plan, Subscription
from apps.billing.services import PLAN_CAPABILITIES


class PlanSerializer(serializers.ModelSerializer):
    prices = serializers.SerializerMethodField()
    class Meta:
        model = Plan
        fields = ["id", "slug", "name", "prices", "features", "capabilities"]
    capabilities = serializers.SerializerMethodField()
    def get_prices(self, plan):
        return {"mensal": plan.monthly_price, "semestral": plan.semiannual_price, "anual": plan.annual_price}

    def get_capabilities(self, plan):
        return PLAN_CAPABILITIES.get(plan.slug, PLAN_CAPABILITIES["gratis"])


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)
    access_active = serializers.SerializerMethodField()
    activated_at = serializers.SerializerMethodField()

    def get_access_active(self, sub):
        from django.utils import timezone
        return sub.status == "active" and (sub.current_period_end > timezone.now() if sub.current_period_end else sub.gateway == "local")

    def get_activated_at(self, sub):
        if sub.gateway == sub.Gateway.LOCAL:
            return sub.created_at
        paid_at = sub.events.filter(type="payment.succeeded").order_by("paid_at").values_list("paid_at", flat=True).first()
        return paid_at or (sub.created_at if sub.status == sub.Status.ACTIVE else None)

    class Meta:
        model = Subscription
        fields = ["id", "plan", "cycle", "status", "gateway", "provider_status", "current_period_end", "cancel_at_period_end", "access_active", "created_at", "updated_at", "activated_at"]


class SubscribeSerializer(serializers.Serializer):
    plan = serializers.SlugField()
    cycle = serializers.ChoiceField(choices=Subscription.Cycle.choices)
