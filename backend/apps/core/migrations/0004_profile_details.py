from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_profile"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="phone",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="profile",
            name="state",
            field=models.CharField(blank=True, max_length=2),
        ),
        migrations.AddField(
            model_name="profile",
            name="city",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="profile",
            name="profession",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="profile",
            name="target_role",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="profile",
            name="study_hours_per_day",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="profile",
            name="disciplines",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
