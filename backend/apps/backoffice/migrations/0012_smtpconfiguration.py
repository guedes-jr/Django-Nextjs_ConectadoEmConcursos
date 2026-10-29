from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("backoffice", "0011_alter_auditevent_options")]

    operations = [
        migrations.CreateModel(
            name="SMTPConfiguration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("host", models.CharField(max_length=255)),
                ("port", models.PositiveIntegerField(default=587)),
                ("username", models.CharField(blank=True, max_length=255)),
                ("password_encrypted", models.TextField(blank=True)),
                ("use_tls", models.BooleanField(default=True)),
                ("use_ssl", models.BooleanField(default=False)),
                ("from_email", models.EmailField(max_length=254)),
                ("enabled", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="updated_smtp_configurations", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "Configuração SMTP", "verbose_name_plural": "Configurações SMTP"},
        ),
    ]
