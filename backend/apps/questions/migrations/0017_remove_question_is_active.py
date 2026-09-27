"""Remoção de `Question.is_active`: o `status` passa a ser a única fonte da verdade.

`is_active` era derivado do `status` por `moderation.sync_visibility`, e os leitores
da app filtravam pelo campo derivado. Dois estados que precisam concordar divergem
em algum lugar, então o campo sai: antes de apagá-lo, o que estiver visível hoje
(`is_active=True`) vira `approved`, para que nenhuma questão saia do ar.
"""

from django.db import migrations

APPROVED = "approved"


def promote_visible_questions(apps, schema_editor):
    Question = apps.get_model("questions", "Question")
    Question.objects.filter(is_active=True).exclude(status=APPROVED).update(
        status=APPROVED
    )


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0016_searchrun_limit"),
    ]

    operations = [
        migrations.RunPython(promote_visible_questions, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="question",
            name="is_active",
        ),
    ]
