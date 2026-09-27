from pathlib import Path
from shutil import copy2

from django.conf import settings
from django.db import migrations


def copy_existing_files(apps, schema_editor):
    Download = apps.get_model("questions", "OfficialExamDownload")
    public_root = Path(settings.MEDIA_ROOT)
    private_root = Path(settings.OFFICIAL_EXAMS_ROOT)
    for download in Download.objects.exclude(file="").iterator():
        source = public_root / download.file.name
        target = private_root / download.file.name
        if source.is_file() and not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            copy2(source, target)


class Migration(migrations.Migration):
    dependencies = [("questions", "0020_private_official_exam_storage")]
    operations = [migrations.RunPython(copy_existing_files, migrations.RunPython.noop)]
