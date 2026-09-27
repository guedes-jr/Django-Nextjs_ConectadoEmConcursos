"""Muda o default de `Question.is_active` de True para False.

Toda questão nova nasce invisível e só fica no ar depois de passar pela fila de
aprovação (`moderation.approve`). O backfill da Fase 0 já garantiu que as questões
aprovadas pré-existentes têm `is_active=True`; esta migração não mexe em linhas.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0013_question_review_note"),
    ]

    operations = [
        migrations.AlterField(
            model_name="question",
            name="is_active",
            field=models.BooleanField(default=False, db_index=True),
        ),
    ]
