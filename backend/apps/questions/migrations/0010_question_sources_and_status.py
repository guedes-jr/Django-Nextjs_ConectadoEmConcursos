import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0009_normalize_question_disciplines"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="QuestionSource",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=60, unique=True)),
                ("name", models.CharField(max_length=120)),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("open_dataset", "Dataset aberto"),
                            ("public_api", "API pública"),
                            ("official_index", "Índice oficial"),
                            ("local_file", "Arquivo local"),
                        ],
                        db_index=True,
                        default="local_file",
                        max_length=20,
                    ),
                ),
                ("home_url", models.URLField(blank=True, max_length=600)),
                ("license_name", models.CharField(blank=True, max_length=120)),
                ("license_url", models.URLField(blank=True, max_length=600)),
                ("attribution", models.CharField(blank=True, max_length=300)),
                ("requires_attribution", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(db_index=True, default=False)),
                ("cached_facets", models.JSONField(blank=True, default=dict)),
                ("facets_at", models.DateTimeField(blank=True, null=True)),
                ("last_sync_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="QuestionStemToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.CharField(db_index=True, max_length=40)),
                ("df", models.PositiveIntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name="SearchRun",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(blank=True, max_length=200)),
                ("filters", models.JSONField(blank=True, default=dict)),
                ("fingerprint", models.CharField(blank=True, db_index=True, max_length=64)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("running", "Em execução"),
                            ("done", "Concluída"),
                            ("partial", "Parcial"),
                            ("failed", "Falhou"),
                            ("cancelled", "Cancelada"),
                        ],
                        db_index=True,
                        default="running",
                        max_length=12,
                    ),
                ),
                ("next_page", models.PositiveIntegerField(blank=True, null=True)),
                ("counts", models.JSONField(blank=True, default=dict)),
                ("duplicates_preview", models.JSONField(blank=True, default=list)),
                ("log_path", models.CharField(blank=True, max_length=300)),
                ("started_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("duration_ms", models.PositiveIntegerField(blank=True, null=True)),
            ],
            options={"ordering": ["-started_at"]},
        ),
        # `source_id` vira `external_id` antes de a FK `source` ocupar o nome da
        # coluna: os ids já gravados são preservados e a unicidade global cai em
        # 0011, quando cada id passa a valer por fonte.
        migrations.RenameField(
            model_name="question",
            old_name="source_id",
            new_name="external_id",
        ),
        migrations.AddField(
            model_name="exam",
            name="level",
            field=models.CharField(blank=True, db_index=True, max_length=40),
        ),
        migrations.AddField(
            model_name="exam",
            name="state",
            field=models.CharField(blank=True, db_index=True, max_length=2),
        ),
        migrations.AddField(
            model_name="question",
            name="content_hash",
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name="question",
            name="number",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="question",
            name="rejection_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="question",
            name="rejection_reason_code",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="question",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="question",
            name="reviewed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reviewed_questions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="question",
            name="source_url",
            field=models.URLField(blank=True, max_length=600),
        ),
        migrations.AddField(
            model_name="question",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Na fila de aprovação"),
                    ("approved", "Aprovada"),
                    ("rejected", "Rejeitada"),
                ],
                db_index=True,
                default="pending",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="question",
            name="source",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="questions",
                to="questions.questionsource",
            ),
        ),
        migrations.AddField(
            model_name="questionstemtoken",
            name="question",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="stem_tokens",
                to="questions.question",
            ),
        ),
        migrations.AddField(
            model_name="searchrun",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="runs",
                to="questions.searchrun",
            ),
        ),
        migrations.AddField(
            model_name="searchrun",
            name="source",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="runs",
                to="questions.questionsource",
            ),
        ),
        migrations.AddField(
            model_name="searchrun",
            name="started_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="question_search_runs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
