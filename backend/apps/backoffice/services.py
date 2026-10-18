import datetime as dt
from uuid import uuid4
from pathlib import Path

from django.conf import settings
from .audit import operation, log as audit_log


def _stamp():
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def list_backups(backup_dir=None):
    backup_dir = Path(backup_dir) if backup_dir else Path(settings.BACKUP_DIR)
    if not backup_dir.exists():
        return []
    items = []
    for path in sorted(backup_dir.glob("backup-*.tar.gz"), reverse=True):
        try:
            if path.is_symlink() or not path.is_file():
                continue
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


def _create_backup(db_path=None, media_root=None, backup_dir=None):
    from . import backup_storage
    directory = Path(backup_dir or settings.BACKUP_DIR)
    name = f"backup-{_stamp()}-{uuid4().hex[:8]}.tar.gz"
    with backup_storage.operation_lock(directory):
        backup_storage.create_archive(directory, name, db_path=db_path, media_root=media_root)
        prune_backups(directory)
    return name


def _restore_backup(name, db_path=None, media_root=None, backup_dir=None, *, maintenance=False):
    from . import backup_storage
    directory = Path(backup_dir or settings.BACKUP_DIR)
    with backup_storage.operation_lock(directory):
        return backup_storage.restore_archive(directory, name, db_path=db_path, media_root=media_root, maintenance=maintenance)


def prune_backups(backup_dir=None):
    backup_dir = Path(backup_dir) if backup_dir else Path(settings.BACKUP_DIR)
    keep = max(1, int(getattr(settings, "BACKUP_KEEP", 20)))
    items = sorted(backup_dir.glob("backup-*.tar.gz"), reverse=True)
    for path in items[keep:]:
        try:
            path.unlink()
        except OSError:
            pass


def create_backup(db_path=None, media_root=None, backup_dir=None, *, request=None):
    with operation("backup.create", resource_type="backup", request=request) as summary:
        name = _create_backup(db_path, media_root, backup_dir)
        summary["name"] = name
        audit_log(request, action="backup.created", resource_type="backup", resource_id=name, after=summary)
        return name


def restore_backup(name, db_path=None, media_root=None, backup_dir=None, *, request=None, maintenance=False):
    # Do not persist arbitrary input paths in the audit trail.
    safe_name = Path(name).name if name else ""
    with operation("backup.restore", resource_type="backup", resource_id=safe_name, request=request) as summary:
        result = _restore_backup(name, db_path, media_root, backup_dir, maintenance=maintenance and request is None)
        summary.update(result)
        audit_log(request, action="backup.restored", resource_type="backup", resource_id=safe_name, after=result)
        return result
