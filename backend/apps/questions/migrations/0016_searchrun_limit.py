from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("questions", "0015_question_search_run")]

    operations = [
        migrations.AddField(
            model_name="searchrun",
            name="limit",
            # `next_page` só é reproduzível com o mesmo `limit` da execução original.
            field=models.PositiveIntegerField(default=500),
        ),
    ]
