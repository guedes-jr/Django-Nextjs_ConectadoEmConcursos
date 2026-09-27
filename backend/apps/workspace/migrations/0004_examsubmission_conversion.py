import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('questions', '0017_remove_question_is_active'),
        ('workspace', '0003_simulationrun_banca_simulationrun_discipline_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='examsubmission',
            name='converted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='examsubmission',
            name='converted_questions',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='examsubmission',
            name='converted_run',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='exam_submissions', to='questions.searchrun'),
        ),
        migrations.AddField(
            model_name='examsubmission',
            name='rights_confirmed',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='examsubmission',
            name='source',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='exam_submissions', to='questions.questionsource'),
        ),
    ]
