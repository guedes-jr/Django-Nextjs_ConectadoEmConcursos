from django.conf import settings
from django.db import migrations

ROLE_NAMES = ("Administrador", "Editor", "Revisor")


def create_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    app_label, model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(app_label, model_name)
    groups = {name: Group.objects.get_or_create(name=name)[0] for name in ROLE_NAMES}
    # Preserva o acesso pré-existente: todo staff já tinha acesso administrativo amplo.
    groups["Administrador"].user_set.add(*User.objects.filter(is_staff=True))


def remove_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=ROLE_NAMES).delete()


class Migration(migrations.Migration):
    dependencies = [("backoffice", "0002_financial_report_permission"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.RunPython(create_roles, remove_roles)]
