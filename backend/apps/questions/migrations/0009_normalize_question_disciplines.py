from django.db import migrations

from apps.questions.naming import normalize_discipline


def normalize_disciplines(apps, schema_editor):
    Question = apps.get_model("questions", "Question")
    rows = Question.objects.exclude(discipline="").values_list("pk", "discipline")
    for pk, discipline in rows:
        fixed = normalize_discipline(discipline)
        if fixed != discipline:
            Question.objects.filter(pk=pk).update(discipline=fixed)


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0008_simulationtemplate"),
    ]

    operations = [
        migrations.RunPython(normalize_disciplines, migrations.RunPython.noop),
    ]