from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db import migrations
from django.utils import timezone


def seed(apps, schema_editor):
    Routine = apps.get_model("backoffice", "OperationalRoutine")
    Schedule = apps.get_model("backoffice", "RoutineSchedule")
    alias = schema_editor.connection.alias
    now = timezone.now()
    local = now.astimezone(ZoneInfo("America/Fortaleza"))
    backup = datetime.combine(local.date(), time(3, 15), tzinfo=local.tzinfo)
    if backup <= local:
        backup += timedelta(days=1)
    for key, name in [("publish_notifications", "Publicar avisos agendados"), ("publish_news", "Publicar artigos agendados"), ("backup", "Backup diário de banco e mídia")]:
        Routine.objects.using(alias).get_or_create(key=key)
        Schedule.objects.using(alias).create(routine_id=key, name=name, enabled=True,
            frequency="daily" if key == "backup" else "interval", interval_minutes=1,
            time_of_day=time(3, 15), timezone_name="America/Fortaleza", next_run_at=backup if key == "backup" else now)


class Migration(migrations.Migration):
    dependencies = [("backoffice", "0013_operationalroutine_routineschedule_routineexecution")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
