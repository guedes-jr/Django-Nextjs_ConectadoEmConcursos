"""Backfill do fluxo de aprovação e preparationo do índice de duplicatas.

O que já estava no ar continua no ar: as questões ativas viram `approved` e passam
a apontar para a fonte `legacy`. As desativadas ficam `pending`, coerente com
`is_active=False`. Nenhuma questão some do site ao aplicar a migração.
"""

from collections import Counter

from django.db import migrations, models

from apps.questions.ingest.duplicates import content_hash, signature_tokens, tokenize
from apps.questions.models import LEGACY_SOURCE_SLUG

APPROVED = "approved"


def backfill_workflow(apps, schema_editor):
    Question = apps.get_model("questions", "Question")
    QuestionSource = apps.get_model("questions", "QuestionSource")
    QuestionStemToken = apps.get_model("questions", "QuestionStemToken")

    source, _ = QuestionSource.objects.get_or_create(
        slug=LEGACY_SOURCE_SLUG,
        defaults={
            "name": "Importação manual",
            "kind": "local_file",
            "license_name": "Não verificada (conteúdo pré-existente)",
        },
    )

    Question.objects.filter(is_active=True).update(status=APPROVED, source=source)

    rows = list(Question.objects.values_list("pk", "statement", "options"))
    tokens_by_pk = {}
    frequencies = Counter()
    for pk, statement, _options in rows:
        tokens = tokenize(statement)
        tokens_by_pk[pk] = tokens
        frequencies.update(tokens)

    Question.objects.bulk_update(
        [
            Question(pk=pk, content_hash=content_hash(statement, options or []))
            for pk, statement, options in rows
        ],
        ["content_hash"],
        batch_size=500,
    )

    QuestionStemToken.objects.bulk_create(
        [
            QuestionStemToken(question_id=pk, token=token, df=frequencies[token])
            for pk, _statement, _options in rows
            for token in signature_tokens(tokens_by_pk[pk], frequencies)
        ],
        batch_size=500,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0010_question_sources_and_status"),
    ]

    operations = [
        migrations.RunPython(backfill_workflow, migrations.RunPython.noop),
        # O id externo só precisa ser único dentro da fonte.
        migrations.AlterField(
            model_name="question",
            name="external_id",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddConstraint(
            model_name="exam",
            constraint=models.UniqueConstraint(
                fields=("title", "banca", "year"), name="unique_exam_title_banca_year"
            ),
        ),
        migrations.AddConstraint(
            model_name="question",
            constraint=models.UniqueConstraint(
                fields=("source", "external_id"), name="unique_question_source_external"
            ),
        ),
        migrations.AddConstraint(
            model_name="questionstemtoken",
            constraint=models.UniqueConstraint(
                fields=("question", "token"), name="unique_question_stem_token"
            ),
        ),
        migrations.AddIndex(
            model_name="question",
            index=models.Index(fields=["status", "-created_at"], name="questions_queue_idx"),
        ),
        migrations.AddIndex(
            model_name="questionstemtoken",
            index=models.Index(fields=["token", "df"], name="questions_token_df_idx"),
        ),
        migrations.AddIndex(
            model_name="questionstemtoken",
            index=models.Index(
                fields=["question", "token"], name="questions_question_token_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="searchrun",
            index=models.Index(
                fields=["fingerprint", "-started_at"], name="questions_run_fingerprint_idx"
            ),
        ),
    ]
