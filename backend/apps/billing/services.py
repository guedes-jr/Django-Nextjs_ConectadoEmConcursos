from django.utils import timezone
from apps.billing.models import Subscription


PLAN_CAPABILITIES = {
    "gratis": {"questions_daily": 20, "chat_daily": 5, "ai_provider": False, "advanced_tools": False},
    "padrao": {"questions_daily": None, "chat_daily": 50, "ai_provider": True, "advanced_tools": False},
    "avancado": {"questions_daily": None, "chat_daily": 200, "ai_provider": True, "advanced_tools": True},
}


def user_plan_slug(user):
    subscription = Subscription.objects.filter(
        user=user, status=Subscription.Status.ACTIVE
    ).select_related("plan").first()
    if not subscription:
        return "gratis"
    if subscription.current_period_end and subscription.current_period_end <= timezone.now():
        return "gratis"
    if subscription.gateway == "stripe" and not subscription.current_period_end:
        return "gratis"
    return subscription.plan.slug


def capabilities_for(user):
    slug = user_plan_slug(user)
    return {"plan": slug, **PLAN_CAPABILITIES.get(slug, PLAN_CAPABILITIES["gratis"])}
