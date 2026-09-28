from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("backoffice", "0003_create_backoffice_roles")]

    operations = [
        migrations.CreateModel(
            name="UserManagementMeta",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("internal_notes", models.TextField(blank=True)),
                ("tags", models.JSONField(blank=True, default=list)),
                ("block_reason", models.CharField(blank=True, max_length=500)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="updated_user_management_meta", to=settings.AUTH_USER_MODEL)),
                ("user", models.OneToOneField(on_delete=models.CASCADE, related_name="management_meta", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "Metadados de gestão de usuário", "verbose_name_plural": "Metadados de gestão de usuários"},
        ),
    ]
