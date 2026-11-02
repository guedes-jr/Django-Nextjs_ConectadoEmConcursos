from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Plan, Subscription


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_free_subscription(sender, instance, created, raw=False, using="default", **kwargs):
    if created and not raw:
        plan = Plan.objects.using(using).get(slug="gratis")
        Subscription.objects.using(using).get_or_create(
            user_id=instance.pk,
            defaults={"plan": plan, "status": Subscription.Status.ACTIVE, "price_amount_minor": 0},
        )
