from django.db import migrations

from apps.questions.naming import normalize_banca


def normalize_bancas(apps, schema_editor):
    """Grava a forma canônica da banca (`CESPE` vira `CEBRASPE`).

    O filtro do aluno aceita as duas grafias, então links antigos continuam
    funcionando depois desta migração.
    """
    Question = apps.get_model("questions", "Question")
    Exam = apps.get_model("questions", "Exam")
    for model in (Question, Exam):
        for pk, banca in model.objects.exclude(banca="").values_list("pk", "banca"):
            fixed = normalize_banca(banca)
            if fixed != banca:
                model.objects.filter(pk=pk).update(banca=fixed)


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0011_backfill_question_workflow"),
    ]

    operations = [
        migrations.RunPython(normalize_bancas, migrations.RunPython.noop),
    ]
