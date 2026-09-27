from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("questions", "0014_question_is_active_default_false")]

    operations = [
        migrations.AddField(
            model_name="question",
            name="search_run",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="questions",
                to="questions.searchrun",
            ),
        ),
    ]
