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
    class Meta:
        model = Subscription
        fields = ["id", "plan", "cycle", "status", "created_at", "updated_at"]


class SubscribeSerializer(serializers.Serializer):
    plan = serializers.SlugField()
    cycle = serializers.ChoiceField(choices=Subscription.Cycle.choices)
