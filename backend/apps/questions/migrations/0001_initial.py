import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="Question",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("discipline", models.CharField(db_index=True, max_length=100)),
                ("banca", models.CharField(db_index=True, max_length=100)),
                ("year", models.PositiveSmallIntegerField(db_index=True)),
                ("statement", models.TextField()),
                ("options", models.JSONField(default=list)),
                ("correct_answer", models.PositiveSmallIntegerField()),
                ("explanation", models.TextField(blank=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["-year", "id"]},
        ),
        migrations.CreateModel(
            name="UserAnswer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("selected_answer", models.PositiveSmallIntegerField()),
                ("is_correct", models.BooleanField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("question", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="answers", to="questions.question")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [models.Index(fields=["user", "question", "-created_at"], name="questions_answer_user_idx")],
            },
        ),
        migrations.CreateModel(
            name="Favorite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("question", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="favorites", to="questions.question")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="QuestionNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("content", models.TextField(blank=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("question", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notes", to="questions.question")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="Comment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("content", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("question", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="comments", to="questions.question")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="ErrorReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("description", models.TextField()),
                ("status", models.CharField(choices=[("open", "Aberto"), ("resolved", "Resolvido"), ("rejected", "Rejeitado")], default="open", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("question", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="error_reports", to="questions.question")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="favorite",
            constraint=models.UniqueConstraint(fields=("user", "question"), name="unique_question_favorite"),
        ),
        migrations.AddConstraint(
            model_name="questionnote",
            constraint=models.UniqueConstraint(fields=("user", "question"), name="unique_question_note"),
        ),
    ]
