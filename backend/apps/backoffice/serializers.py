from rest_framework import serializers

from apps.billing.models import Plan, Subscription


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ["id", "slug", "name", "description", "monthly_price", "semiannual_price", "annual_price", "features", "status", "is_highlighted", "trial_days", "is_active", "sort_order"]


class SubscriptionAdminSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    plan_slug = serializers.CharField(source="plan.slug", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)

    class Meta:
        model = Subscription
        fields = ["id", "user_id", "username", "email", "plan_slug", "plan_name", "cycle", "status", "gateway", "current_period_end", "created_at", "updated_at"]