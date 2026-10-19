import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
from unittest.mock import patch

from django.conf import settings
from django.test import SimpleTestCase, override_settings

from . import backup_storage as storage


class BackupStorageTests(SimpleTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        isolated = override_settings(OFFICIAL_EXAMS_ROOT=self.root / "private")
        isolated.enable()
        self.addCleanup(isolated.disable)
        self.backups = self.root / "backups"
        self.backups.mkdir()
        self.media = self.root / "media"
        self.media.mkdir()
        (self.media / "file.txt").write_text("original")
        self.db = self.root / "db.sqlite3"
        with sqlite3.connect(self.db) as connection:
            connection.execute("CREATE TABLE example(value TEXT)")
            connection.execute("INSERT INTO example VALUES ('original')")

    def archive(self, name="backup-test.tar.gz"):
        storage.create_archive(self.backups, name, db_path=self.db, media_root=self.media)
        return name

    def test_manifest_private_permissions_and_empty_media_restore(self):
        (self.media / "file.txt").unlink()
        name = self.archive()
        with tarfile.open(self.backups / name) as tar:
            manifest = json.load(tar.extractfile("manifest.json"))
        self.assertEqual(manifest["engine"], "sqlite3")
        self.assertEqual((self.backups / name).stat().st_mode & 0o777, 0o600)
        (self.media / "later.txt").write_text("later")
        result = storage.restore_archive(self.backups, name, db_path=self.db, media_root=self.media)
        self.assertEqual(list(self.media.iterdir()), [])
        self.assertTrue((self.media.parent / result["previous_media_saved_at"] / "later.txt").exists())

    def test_corrupt_database_or_checksum_does_not_change_live_data(self):
        name = self.archive()
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            storage.extract_archive(self.backups / name, tmp)
            (tmp / "db.sqlite3").write_text("corrupt")
            with tarfile.open(self.backups / name, "w:gz") as tar:
                for item in tmp.iterdir():
                    tar.add(item, arcname=item.name)
        with self.assertRaisesRegex(ValueError, "Integridade"):
            storage.restore_archive(self.backups, name, db_path=self.db, media_root=self.media)
        with sqlite3.connect(self.db) as connection:
            self.assertEqual(connection.execute("SELECT value FROM example").fetchone(), ("original",))
        self.assertEqual((self.media / "file.txt").read_text(), "original")

    def test_legacy_sqlite_archive_remains_supported(self):
        name = "backup-legacy.tar.gz"
        with tarfile.open(self.backups / name, "w:gz") as tar:
            tar.add(self.db, arcname="db.sqlite3")
        result = storage.restore_archive(self.backups, name, db_path=self.db, media_root=self.media)
        self.assertEqual(result["restored"], name)
        self.assertIsNone(result["previous_media_saved_at"])
        self.assertTrue((self.media / "file.txt").exists())

    def test_rejects_links_traversal_special_members_and_size_limits(self):
        for member_name, member_type in [("../escape", tarfile.REGTYPE), ("media/link", tarfile.SYMTYPE), ("media/device", tarfile.CHRTYPE)]:
            name = self.backups / "backup-unsafe.tar.gz"
            with tarfile.open(name, "w:gz") as tar:
                member = tarfile.TarInfo(member_name)
                member.type = member_type
                member.linkname = "/etc/passwd"
                tar.addfile(member)
            with self.subTest(name=member_name), self.assertRaises(ValueError):
                storage.restore_archive(self.backups, name.name, db_path=self.db, media_root=self.media)
        name = self.archive()
        with override_settings(BACKUP_MAX_FILES=1), self.assertRaisesRegex(ValueError, "limites"):
            storage.restore_archive(self.backups, name, db_path=self.db, media_root=self.media)
        with override_settings(BACKUP_MAX_UNPACKED_BYTES=1), self.assertRaisesRegex(ValueError, "limites"):
            storage.restore_archive(self.backups, name, db_path=self.db, media_root=self.media)

    def test_backup_rejects_media_links_nested_archives_and_missing_database(self):
        (self.media / "link").symlink_to(self.db)
        with self.assertRaises(ValueError):
            self.archive()
        (self.media / "link").unlink()
        with self.assertRaises(ValueError):
            storage.create_archive(self.media / "backups", "backup-test.tar.gz", db_path=self.db, media_root=self.media)
        self.db.unlink()
        with self.assertRaisesRegex(ValueError, "não encontrado"):
            self.archive()
        self.assertFalse(list(self.backups.glob("backup-*.tar.gz")))

    def test_concurrent_operation_fails_without_waiting(self):
        with storage.operation_lock(self.backups):
            with self.assertRaisesRegex(ValueError, "andamento"):
                with storage.operation_lock(self.backups):
                    self.fail("Second lock acquired")

    def test_failed_media_swap_keeps_previous_media_and_recovery_database(self):
        name = self.archive()
        original_replace = os.replace
        def replace(source, target):
            if Path(target) == self.media and "media" == Path(source).name:
                raise OSError("simulated disk error")
            return original_replace(source, target)
        with patch.object(storage.os, "replace", side_effect=replace):
            with self.assertRaisesRegex(ValueError, "Banco restaurado"):
                storage.restore_archive(self.backups, name, db_path=self.db, media_root=self.media)
        self.assertTrue((self.media / "file.txt").exists())
        self.assertTrue(self.db.with_suffix(".sqlite3.bak").exists())


class PostgresBackupTests(SimpleTestCase):
    def pg_settings(self):
        return {"default": {"ENGINE": "django.db.backends.postgresql", "NAME": "test_database", "USER": "dbuser", "HOST": "127.0.0.1", "PORT": "5432", "PASSWORD": "private:password", "OPTIONS": {"sslmode": "verify-full"}}}

    def test_client_receives_credentials_only_in_ephemeral_private_file(self):
        seen = {}
        def run(args, **kwargs):
            seen.update(kwargs)
            self.assertNotIn("private:password", str(args))
            self.assertNotIn("PGPASSWORD", kwargs["env"])
            path = Path(kwargs["env"]["PGPASSFILE"])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.read_text(), "*:*:*:*:private\\:password\n")
            self.assertEqual(kwargs["env"]["PGSSLMODE"], "verify-full")
        with patch.dict(settings.DATABASES, self.pg_settings(), clear=True), patch.object(storage.subprocess, "run", side_effect=run):
            storage.pg_run("pg_dump", ["--format=custom"])
        self.assertFalse(Path(seen["env"]["PGPASSFILE"]).exists())
        self.assertEqual(seen["timeout"], settings.BACKUP_COMMAND_TIMEOUT)

    def test_client_failure_and_timeout_do_not_expose_provider_error(self):
        for error in [subprocess.TimeoutExpired("pg_dump private-secret", 1), subprocess.CalledProcessError(1, "pg_dump", stderr="password=private-secret"), FileNotFoundError()]:
            with patch.dict(settings.DATABASES, self.pg_settings(), clear=True), patch.object(storage.subprocess, "run", side_effect=error):
                with self.assertRaises(ValueError) as result:
                    storage.pg_run("pg_dump", [])
            self.assertNotIn("private-secret", str(result.exception))

    def test_postgres_roundtrip_contract_and_web_restore_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            backups = root / "backups"; backups.mkdir()
            media = root / "media"; media.mkdir()
            calls = []
            def pg_run(tool, args):
                calls.append((tool, list(map(str, args))))
                if tool == "pg_dump":
                    Path(args[args.index("--file") + 1]).write_bytes(b"PGDMP-synthetic-test-data")
            with patch.dict(settings.DATABASES, self.pg_settings(), clear=True), patch.object(storage, "pg_run", side_effect=pg_run), patch.object(storage.connections, "close_all"):
                storage.create_archive(backups, "backup-pg.tar.gz", media_root=media)
                with self.assertRaisesRegex(ValueError, "CLI"):
                    storage.restore_archive(backups, "backup-pg.tar.gz", media_root=media)
                result = storage.restore_archive(backups, "backup-pg.tar.gz", media_root=media, maintenance=True)
            restore = [args for tool, args in calls if tool == "pg_restore" and "--clean" in args][0]
            self.assertIn("--single-transaction", restore)
            self.assertIn("--exit-on-error", restore)
            self.assertIn("--no-owner", restore)
            self.assertTrue((backups / result["previous_db_saved_at"]).exists())
            self.assertEqual(len([tool for tool, args in calls if tool == "pg_dump"]), 2)

    def test_postgres_restore_failure_preserves_media_and_uses_no_web_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            backups = root / "backups"; backups.mkdir()
            media = root / "media"; media.mkdir()
            (media / "file").write_text("before")
            def pg_run(tool, args):
                if tool == "pg_dump":
                    Path(args[args.index("--file") + 1]).write_bytes(b"PGDMP-test")
                elif "--clean" in args:
                    raise ValueError("simulated transactional restore failure")
            with patch.dict(settings.DATABASES, self.pg_settings(), clear=True), patch.object(storage, "pg_run", side_effect=pg_run), patch.object(storage.connections, "close_all"):
                storage.create_archive(backups, "backup-pg.tar.gz", media_root=media)
                (media / "file").write_text("after")
                with self.assertRaisesRegex(ValueError, "transactional"):
                    storage.restore_archive(backups, "backup-pg.tar.gz", media_root=media, maintenance=True)
            self.assertEqual((media / "file").read_text(), "after")
            self.assertEqual(len(list(backups.glob("before-restore-*.dump"))), 1)


class ConcursoFileBackupTests(SimpleTestCase):
    setUp = BackupStorageTests.setUp
    archive = BackupStorageTests.archive
    def test_uploaded_files_roundtrip_with_database_and_remain_private(self):
        private = storage.concurso_files_root()
        private.mkdir(parents=True)
        (private / "edital.pdf").write_bytes(b"%PDF-1.4\noriginal\n%%EOF")
        name = self.archive()
        with tarfile.open(self.backups / name) as archive:
            self.assertIn("concurso-files/edital.pdf",archive.getnames())
        (private / "edital.pdf").write_bytes(b"alterado")
        result = storage.restore_archive(self.backups,name,db_path=self.db,media_root=self.media)
        self.assertIn(b"original",(private / "edital.pdf").read_bytes())
        self.assertEqual((private / "edital.pdf").stat().st_mode & 0o777,0o600)
        self.assertEqual((private.parent / result["previous_concurso_files_saved_at"] / "edital.pdf").read_bytes(),b"alterado")

    def test_private_symlinks_and_missing_private_manifest_are_rejected(self):
        private=storage.concurso_files_root();private.mkdir(parents=True)
        (private / "link.pdf").symlink_to(self.media / "file.txt")
        with self.assertRaises(ValueError):self.archive()
        (private / "link.pdf").unlink()
        name=self.archive()
        with tempfile.TemporaryDirectory() as temporary:
            extracted=Path(temporary);storage.extract_archive(self.backups/name,extracted)
            (extracted / "concurso-files").rmdir()
            with self.assertRaisesRegex(ValueError,"privados"):
                storage.validate_database(extracted)


    def test_private_swap_failure_preserves_old_media_and_private_files(self):
        private=storage.concurso_files_root();private.mkdir(parents=True)
        (private / "edital.pdf").write_bytes(b"saved")
        name=self.archive()
        (private / "edital.pdf").write_bytes(b"current-private")
        (self.media / "file.txt").write_text("current-media")
        original=storage.os.replace
        def replace(source,destination):
            if Path(source).name=="concurso-files" and Path(destination)==private:
                raise OSError("simulated disk failure")
            return original(source,destination)
        with patch.object(storage.os,"replace",side_effect=replace):
            with self.assertRaisesRegex(ValueError,"troca dos arquivos falhou"):
                storage.restore_archive(self.backups,name,db_path=self.db,media_root=self.media)
        self.assertEqual((self.media / "file.txt").read_text(),"current-media")
        self.assertEqual((private / "edital.pdf").read_bytes(),b"current-private")

    def test_empty_private_snapshot_restores_empty_and_keeps_later_files_for_recovery(self):
        name=self.archive()
        private=storage.concurso_files_root();private.mkdir(parents=True)
        (private / "later.pdf").write_bytes(b"later")
        result=storage.restore_archive(self.backups,name,db_path=self.db,media_root=self.media)
        self.assertEqual(list(private.iterdir()),[])
        self.assertTrue((private.parent / result['previous_concurso_files_saved_at'] / 'later.pdf').is_file())
