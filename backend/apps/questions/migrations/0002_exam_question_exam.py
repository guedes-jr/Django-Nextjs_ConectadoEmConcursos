import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("questions", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="Exam",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("banca", models.CharField(db_index=True, max_length=100)),
                ("institution", models.CharField(blank=True, db_index=True, max_length=160)),
                ("role", models.CharField(blank=True, db_index=True, max_length=160)),
                ("year", models.PositiveSmallIntegerField(db_index=True)),
                ("is_published", models.BooleanField(db_index=True, default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["-year", "banca", "title"]},
        ),
        migrations.AddField(
            model_name="question",
            name="exam",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="questions", to="questions.exam"),
        ),
    ]
