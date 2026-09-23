import datetime as dt
import shutil
import sqlite3
import tarfile
import tempfile
from pathlib import Path

from django.conf import settings


def _stamp():
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def list_backups(backup_dir=None):
    backup_dir = Path(backup_dir) if backup_dir else Path(settings.BACKUP_DIR)
    if not backup_dir.exists():
        return []
    items = []
    for path in sorted(backup_dir.glob("backup-*.tar.gz"), reverse=True):
        try:
            stat = path.stat()
            items.append(
                {
                    "name": path.name,
                    "size": stat.st_size,
                    "created_at": dt.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                }
            )
        except OSError:
            continue
    return items


def create_backup(db_path=None, media_root=None, backup_dir=None):
    backup_dir = Path(backup_dir) if backup_dir else Path(settings.BACKUP_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)
    db_path = Path(db_path) if db_path else Path(settings.DATABASES["default"]["NAME"])
    media_root = Path(media_root) if media_root else Path(settings.MEDIA_ROOT)
    archive_path = backup_dir / f"backup-{_stamp()}.tar.gz"

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_copy = tmp_path / "db.sqlite3"
        with sqlite3.connect(db_path) as source, sqlite3.connect(db_copy) as target:
            source.backup(target)

        files = [("db.sqlite3", db_copy)]
        if media_root.exists() and any(media_root.rglob("*")):
            files.append(("media", media_root))

        with tarfile.open(archive_path, "w:gz") as tar:
            for arcname, filepath in files:
                tar.add(filepath, arcname=arcname)

    prune_backups(backup_dir)
    return archive_path.name


def restore_backup(name, db_path=None, media_root=None, backup_dir=None):
    backup_dir = Path(backup_dir) if backup_dir else Path(settings.BACKUP_DIR)
    db_path = Path(db_path) if db_path else Path(settings.DATABASES["default"]["NAME"])
    media_root = Path(media_root) if media_root else Path(settings.MEDIA_ROOT)
    archive_path = backup_dir / name
    if not name or not archive_path.is_file() or not archive_path.name.startswith("backup-"):
        raise ValueError("Backup não encontrado.")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(tmp_path, filter=tarfile.data_filter)

        db_copy = tmp_path / "db.sqlite3"
        if not db_copy.is_file() or db_copy.stat().st_size == 0:
            raise ValueError("Backup inválido: arquivo de banco ausente ou vazio.")

        media_copy = tmp_path / "media"
        db_backup_path = db_path.with_suffix(".sqlite3.bak")
        shutil.copy2(db_path, db_backup_path)

        with sqlite3.connect(db_copy) as source, sqlite3.connect(db_path) as target:
            source.backup(target)

        if media_copy.exists():
            if media_root.exists():
                shutil.rmtree(media_root)
            shutil.copytree(media_copy, media_root)

    return {
        "restored": name,
        "previous_db_saved_at": db_backup_path.name,
    }


def prune_backups(backup_dir=None):
    backup_dir = Path(backup_dir) if backup_dir else Path(settings.BACKUP_DIR)
    keep = max(1, int(getattr(settings, "BACKUP_KEEP", 20)))
    items = sorted(backup_dir.glob("backup-*.tar.gz"), reverse=True)
    for path in items[keep:]:
        try:
            path.unlink()
        except OSError:
            pass