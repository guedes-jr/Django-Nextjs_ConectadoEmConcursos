from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("studies", "0002_study_plan_kinds")]
    operations = [migrations.AddField(model_name="studyplan", name="discipline_colors", field=models.JSONField(blank=True, default=dict))]
