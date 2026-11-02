from django.conf import settings
from django.db import migrations


def assign_free_subscriptions(apps, schema_editor):
    alias = schema_editor.connection.alias
    User = apps.get_model(settings.AUTH_USER_MODEL)
    Plan = apps.get_model("billing", "Plan")
    Subscription = apps.get_model("billing", "Subscription")
    plan = Plan.objects.using(alias).get(slug="gratis")
    users = User.objects.using(alias).filter(subscription__isnull=True)
    batch = []
    for user_id in users.values_list("pk", flat=True).iterator(chunk_size=1000):
        batch.append(Subscription(user_id=user_id, plan_id=plan.pk, status="active", price_amount_minor=0))
        if len(batch) == 1000:
            Subscription.objects.using(alias).bulk_create(batch, ignore_conflicts=True)
            batch = []
    if batch:
        Subscription.objects.using(alias).bulk_create(batch, ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0007_billingcheckout_gateway_billingcheckout_sandbox_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [migrations.RunPython(assign_free_subscriptions, migrations.RunPython.noop)]
