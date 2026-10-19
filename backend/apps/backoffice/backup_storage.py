"""Local SQLite/PostgreSQL backup artifacts, with staged media and atomic publication."""
from contextlib import contextmanager, ExitStack
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
from uuid import uuid4

from django.conf import settings
from django.db import connections


@contextmanager
def operation_lock(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(directory / ".operation.lock", os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(descriptor, "r+b") as handle:
        try:
            if os.name == "nt":
                import msvcrt
                if not handle.read(1):
                    handle.write(b"0"); handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise ValueError("Já existe uma operação de backup/restauração em andamento.") from exc
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def engine():
    value = settings.DATABASES["default"]["ENGINE"]
    if value.endswith(".sqlite3"):
        return "sqlite3"
    if value.endswith(".postgresql"):
        return "postgresql"
    raise ValueError("Banco não suportado pelo serviço de backup.")


def digest(path):
    with open(path, "rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def pg_run(tool, arguments):
    conf = settings.DATABASES["default"]
    if any(value in str(conf["NAME"]) for value in ("=", "://", "\n", "\r")):
        raise ValueError("DB_NAME deve ser um nome de banco, não uma URL ou string de conexão.")
    options = conf.get("OPTIONS", {})
    supported = {"sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT", "sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY", "options": "PGOPTIONS"}
    if set(options) - set(supported) - {"connect_timeout"}:
        raise ValueError("Opções PostgreSQL não suportadas pelo backup; revise a configuração operacional.")
    env = {key: value for key, value in os.environ.items() if key in {"PATH", "LANG", "LC_ALL", "LC_CTYPE", "SYSTEMROOT", "WINDIR", "TMPDIR"}}
    env.update({"PGDATABASE": str(conf["NAME"]), "PGCONNECT_TIMEOUT": str(options.get("connect_timeout", 10))})
    for key, name in (("HOST", "PGHOST"), ("PORT", "PGPORT"), ("USER", "PGUSER")):
        if conf.get(key):
            env[name] = str(conf[key])
    for key, name in supported.items():
        if options.get(key):
            env[name] = str(options[key])
    password = str(conf.get("PASSWORD", ""))
    if "\n" in password or "\r" in password:
        raise ValueError("Senha PostgreSQL incompatível com o arquivo de credenciais do utilitário.")
    with tempfile.TemporaryDirectory() as tmp:
        passfile = Path(tmp) / "pgpass"
        descriptor = os.open(passfile, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "w") as handle:
            handle.write("*:*:*:*:" + password.replace("\\", "\\\\").replace(":", "\\:") + "\n")
        env["PGPASSFILE"] = str(passfile)
        binary = settings.PG_DUMP_BIN if tool == "pg_dump" else settings.PG_RESTORE_BIN
        try:
            subprocess.run([binary, "--no-password", *map(str, arguments)], env=env, stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
                           timeout=settings.BACKUP_COMMAND_TIMEOUT)
        except (OSError, subprocess.SubprocessError) as exc:
            # No provider stderr, connection strings or credentials in responses/audit.
            raise ValueError(f"{tool} não concluiu. Verifique cliente, versão, conexão e permissões no servidor.") from exc


def database_copy(destination, *, db_path=None):
    if engine() == "postgresql":
        if db_path is not None:
            raise ValueError("Não informe caminho SQLite para um banco PostgreSQL.")
        pg_run("pg_dump", ["--format=custom", "--lock-wait-timeout=10s", "--file", destination])
    else:
        source_path = Path(db_path or settings.DATABASES["default"]["NAME"]).absolute()
        if not source_path.is_file():
            raise ValueError("Banco SQLite não encontrado; backup não cria um banco vazio.")
        with sqlite3.connect(f"{source_path.as_uri()}?mode=ro", uri=True) as source, sqlite3.connect(destination) as target:
            source.backup(target)


def validate_media_tree(root):
    total, count = 0, 1
    if root.is_symlink():
        raise ValueError("A raiz de mídia não pode ser um link simbólico.")
    if root.exists():
        for path in root.rglob("*"):
            if path.is_symlink() or not (path.is_file() or path.is_dir()):
                raise ValueError("Mídia contém link ou arquivo especial não permitido no backup.")
            count += 1
            if path.is_file():
                total += path.stat().st_size
    return total, count


def concurso_files_root():
    return Path(settings.OFFICIAL_EXAMS_ROOT).absolute() / "concurso-materials"


def _validate_private_root(root, media, directory):
    if (root.is_symlink() or root == Path(root.anchor) or
            root.resolve().is_relative_to(media.resolve()) or media.resolve().is_relative_to(root.resolve()) or
            directory.resolve().is_relative_to(root.resolve()) or root.resolve().is_relative_to(directory.resolve())):
        raise ValueError("Destino de arquivos privados inválido ou sobreposto à mídia/backups.")


def create_archive(directory, name, *, db_path=None, media_root=None):
    directory = Path(directory)
    root = Path(media_root or settings.MEDIA_ROOT).absolute()
    private = concurso_files_root()
    if directory.resolve().is_relative_to(root.resolve()):
        raise ValueError("O diretório de backup deve ficar fora da mídia pública.")
    _validate_private_root(private, root, directory)
    media_bytes, media_count = validate_media_tree(root)
    private_bytes, private_count = validate_media_tree(private)
    with tempfile.TemporaryDirectory(dir=directory) as tmp:
        tmp = Path(tmp)
        filename = "db.dump" if engine() == "postgresql" else "db.sqlite3"
        database = tmp / filename
        database_copy(database, db_path=db_path)
        if not database.is_file() or database.stat().st_size == 0:
            raise ValueError("Utilitário não produziu um backup de banco válido.")
        manifest = {"version": 1, "engine": engine(), "database": filename, "sha256": digest(database),
                    "media_included": True, "concurso_files_included": True}
        (tmp / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        if media_count + private_count + 4 > settings.BACKUP_MAX_FILES or media_bytes + private_bytes + database.stat().st_size + (tmp / "manifest.json").stat().st_size > settings.BACKUP_MAX_UNPACKED_BYTES:
            raise ValueError("Backup excede os limites de arquivos/tamanho descompactado.")
        empty = tmp / "empty-media"
        empty.mkdir()
        archive = tmp / "artifact.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(database, arcname=filename)
            tar.add(tmp / "manifest.json", arcname="manifest.json")
            tar.add(root if root.exists() else empty, arcname="media")
            tar.add(private if private.exists() else empty, arcname="concurso-files")
        archive.chmod(0o600)
        os.replace(archive, directory / name)
    return name


def extract_archive(archive, target):
    with tarfile.open(archive, "r:gz") as tar:
        members = []
        total = 0
        seen = set()
        for member in tar:
            path = Path(member.name)
            if (path.is_absolute() or ".." in path.parts or "\\" in member.name or not path.parts
                    or path.parts[0] not in {"manifest.json", "db.dump", "db.sqlite3", "media", "concurso-files"}
                    or not (member.isfile() or member.isdir()) or str(path) in seen):
                raise ValueError("Backup contém caminho, link ou tipo de arquivo não permitido.")
            member.uid = member.gid = None
            member.uname = member.gname = None
            member.mode = (0o700 if path.parts[0] == "concurso-files" else 0o755) if member.isdir() else 0o644 if path.parts[0] == "media" else 0o600
            seen.add(str(path))
            total += member.size
            members.append(member)
            if len(members) > settings.BACKUP_MAX_FILES or total > settings.BACKUP_MAX_UNPACKED_BYTES:
                raise ValueError("Backup excede os limites de arquivos/tamanho descompactado.")
        # Only validated regular files/directories; independent of Python's tar filters.
        tar.extractall(target, members=members)


def validate_database(tmp):
    manifest_path = tmp / "manifest.json"
    if manifest_path.exists():
        if manifest_path.stat().st_size > 16384:
            raise ValueError("Manifesto de backup excede o limite.")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (ValueError, UnicodeError) as exc:
            raise ValueError("Manifesto de backup inválido.") from exc
        if not isinstance(manifest, dict) or manifest.get("version") != 1 or manifest.get("engine") != engine():
            raise ValueError("Formato ou banco do backup não corresponde ao destino.")
        filename = "db.dump" if engine() == "postgresql" else "db.sqlite3"
        if manifest.get("database") != filename or manifest.get("media_included") is not True or not (tmp / "media").is_dir():
            raise ValueError("Conteúdo do backup não corresponde ao manifesto.")
        if "concurso_files_included" in manifest and manifest["concurso_files_included"] is not True:
            raise ValueError("Manifesto de arquivos privados inválido.")
        if (tmp / "concurso-files").exists() != bool(manifest.get("concurso_files_included")):
            raise ValueError("Arquivos privados não correspondem ao manifesto.")
    else:
        if engine() != "sqlite3" or (tmp / "db.dump").exists():
            raise ValueError("Backup PostgreSQL exige manifesto de formato/banco.")
        filename = "db.sqlite3"
        if (tmp / "concurso-files").exists():
            raise ValueError("Arquivos privados exigem manifesto de backup.")
        manifest = None  # Compatibility with existing SQLite archives.
    database = tmp / filename
    if not database.is_file() or database.stat().st_size == 0:
        raise ValueError("Backup inválido: arquivo de banco ausente ou vazio.")
    if manifest and digest(database) != manifest.get("sha256"):
        raise ValueError("Integridade do banco no backup não confere.")
    if engine() == "postgresql":
        pg_run("pg_restore", ["--list", database])
    else:
        try:
            with sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True) as connection:
                if connection.execute("PRAGMA quick_check").fetchone() != ("ok",):
                    raise ValueError("Integridade SQLite inválida.")
        except sqlite3.DatabaseError as exc:
            raise ValueError("Arquivo SQLite inválido.") from exc
    return database


def restore_archive(directory, name, *, db_path=None, media_root=None, maintenance=False):
    directory = Path(directory)
    if not name or Path(name).name != name or not name.startswith("backup-") or not name.endswith(".tar.gz"):
        raise ValueError("Nome de backup inválido.")
    archive = directory / name
    if archive.is_symlink() or not archive.is_file():
        raise ValueError("Backup não encontrado.")
    if engine() == "postgresql" and db_path is not None:
        raise ValueError("Não informe caminho SQLite para um banco PostgreSQL.")
    if engine() == "postgresql" and not maintenance:
        raise ValueError("Restauração PostgreSQL exige CLI com --maintenance --confirm e aplicação/workers parados.")
    root = Path(media_root or settings.MEDIA_ROOT).absolute()
    if root.is_symlink() or root == Path(root.anchor) or directory.resolve().is_relative_to(root.resolve()):
        raise ValueError("Destino de mídia inválido ou sobreposto ao diretório de backups.")
    root.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory(dir=root.parent) as media_stage, ExitStack() as stages:
        tmp = Path(tmp)
        try:
            extract_archive(archive, tmp)
        except (tarfile.TarError, OSError) as exc:
            raise ValueError("Arquivo de backup inválido ou ilegível.") from exc
        database = validate_database(tmp)
        private_copy = tmp / "concurso-files"
        private_root = concurso_files_root()
        if private_copy.exists():
            _validate_private_root(private_root, root, directory)
            private_root.parent.mkdir(parents=True, exist_ok=True)
            private_stage = stages.enter_context(tempfile.TemporaryDirectory(dir=private_root.parent))
            staged_private = Path(private_stage) / "concurso-files"
            shutil.copytree(private_copy, staged_private)
        media_copy = tmp / "media"
        staged = Path(media_stage) / "media"
        if media_copy.exists():
            shutil.copytree(media_copy, staged)
        if engine() == "postgresql":
            recovery = directory / f"before-restore-{uuid4().hex}.dump"
            descriptor = os.open(recovery, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(descriptor)
            database_copy(recovery)
            recovery.chmod(0o600)
            connections.close_all()
            pg_run("pg_restore", ["--clean", "--if-exists", "--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", "--dbname", settings.DATABASES["default"]["NAME"], database])
        else:
            destination = Path(db_path or settings.DATABASES["default"]["NAME"]).absolute()
            recovery = destination.with_suffix(".sqlite3.bak")
            database_copy(recovery, db_path=destination)
            recovery.chmod(0o600)
            with sqlite3.connect(database) as source, sqlite3.connect(destination) as target:
                source.backup(target)
        previous_media = None
        previous_private = None
        swaps = []
        try:
            if media_copy.exists():
                previous_media = _swap_tree(root, staged, "media")
                swaps.append((root, previous_media, "media"))
            if private_copy.exists():
                previous_private = _swap_tree(private_root, staged_private, "concurso-files")
                swaps.append((private_root, previous_private, "concurso-files"))
        except OSError as exc:
            # Keep both the old and restored files available for recovery.
            for destination, previous, label in reversed(swaps):
                try:
                    if destination.exists():
                        os.replace(destination, destination.parent / f".failed-restore-{label}-{uuid4().hex}")
                    if previous and previous.exists():
                        os.replace(previous, destination)
                except OSError:
                    pass
            raise ValueError("Banco restaurado, mas troca dos arquivos falhou. Arquivos anteriores preservados; mantenha manutenção e use a cópia de recuperação do banco.") from exc

    return {"restored": name, "previous_db_saved_at": recovery.name,
            "previous_media_saved_at": previous_media.name if previous_media and previous_media.exists() else None,
            "previous_concurso_files_saved_at": previous_private.name if previous_private and previous_private.exists() else None}


def _swap_tree(root, staged, label):
    previous = root.parent / f".before-restore-{label}-{uuid4().hex}"
    try:
        if root.exists():
            os.replace(root, previous)
        os.replace(staged, root)
    except OSError:
        if previous.exists() and not root.exists():
            os.replace(previous, root)
        raise
    return previous if previous.exists() else None
