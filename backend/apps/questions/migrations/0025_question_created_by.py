# Generated manually for administrative question authorship.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0024_manual_question_drafts"),
    ]

    operations = [
        migrations.AddField(
            model_name="question",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="created_questions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
