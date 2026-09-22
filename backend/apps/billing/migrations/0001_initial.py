import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_plans(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    plans = [
        ("gratis", "Grátis", "0", "0", "0", ["20 questões por dia", "5 mensagens locais por dia", "Estatísticas básicas"]),
        ("padrao", "Padrão", "39.90", "199.00", "399.00", ["Questões ilimitadas", "50 mensagens de IA por dia", "Estatísticas completas"]),
        ("avancado", "Avançado", "79.80", "399.00", "798.00", ["Questões ilimitadas", "200 mensagens de IA por dia", "Contexto de provas e questões no chat"]),
    ]
    for order, values in enumerate(plans):
        slug, name, monthly, semiannual, annual, features = values
        Plan.objects.update_or_create(slug=slug, defaults={"name": name, "monthly_price": monthly, "semiannual_price": semiannual, "annual_price": annual, "features": features, "sort_order": order})


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="Plan", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("slug", models.SlugField(unique=True)), ("name", models.CharField(max_length=80)),
            ("monthly_price", models.DecimalField(decimal_places=2, default=0, max_digits=8)),
            ("semiannual_price", models.DecimalField(decimal_places=2, default=0, max_digits=8)),
            ("annual_price", models.DecimalField(decimal_places=2, default=0, max_digits=8)),
            ("features", models.JSONField(default=list)), ("is_active", models.BooleanField(default=True)),
            ("sort_order", models.PositiveSmallIntegerField(default=0)),
        ], options={"ordering": ["sort_order", "id"]}),
        migrations.CreateModel(name="Subscription", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("cycle", models.CharField(choices=[("mensal", "Mensal"), ("semestral", "Semestral"), ("anual", "Anual")], default="mensal", max_length=10)),
            ("status", models.CharField(choices=[("active", "Ativa"), ("pending_payment", "Pagamento pendente"), ("canceled", "Cancelada")], default="pending_payment", max_length=20)),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("plan", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="billing.plan")),
            ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="subscription", to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.RunPython(seed_plans, migrations.RunPython.noop),
    ]
