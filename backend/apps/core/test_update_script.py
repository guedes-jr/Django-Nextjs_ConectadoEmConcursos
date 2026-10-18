"""Exercise rollout sequencing with fake processes; never deploy or contact a host."""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from django.conf import settings
from django.test import SimpleTestCase


class UpdateScriptTests(SimpleTestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix="conectado-update-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.project = self.root / "project"
        for directory in [".git", "backend/.venv/bin", "frontend/.next", "bin", "state"]:
            (self.project / directory).mkdir(parents=True)
        (self.project / "backend/.env").write_text("# synthetic fixture, no credentials\n")
        (self.project / "frontend/package-lock.json").write_text("{}")
        (self.project / "frontend/.next/BUILD_ID").write_text("new-build")
        self.state = self.project / "state"
        self.events = self.state / "events"
        self.marker = self.state / "maintenance"
        self.script = settings.BASE_DIR.parent / "scripts/update.sh"
        helper = self.project / "bin/helper"
        helper.write_text(f"#!{sys.executable}\nSTATE = {str(self.state)!r}\n" + r'''
import json, os, pathlib, subprocess, sys
state = pathlib.Path(STATE)
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
with (state / "events").open("a") as output:
    output.write(json.dumps([name, *args]) + "\n")
failure = (state / "failure").read_text() if (state / "failure").exists() else ""
if name == "id": print("deploy")
elif name == "node": print("24")
elif name == "git":
    if args[:2] == ["branch", "--show-current"]: print("main")
    elif args[:2] == ["status", "--porcelain"]: print(" M changed.py" if failure == "dirty" else "", end="")
    elif args[0] == "rev-parse": print("old" if args[1] == "HEAD" else "new")
elif name == "redis-cli": print("PONG")
elif name == "sudo": pass
elif name == "systemctl": pass
elif name == "sleep": pass
elif name == "npm": pass
elif name == "python":
    if "manage.py" in args:
        command = args[args.index("manage.py") + 1]
        if command == failure: sys.exit(1)
    elif args[:1] == ["-c"] and args[1] != "import daphne":
        sys.exit(subprocess.call([sys.executable, *args]))
elif name == "curl":
    url = args[-1]
    if "--write-out" in args:
        public = url.startswith("https://example.test")
        print("503" if public and (state / "maintenance").exists() else "200", end="")
    elif "--dump-header" in args:
        target = "https://evil.test/login?next=/admin" if failure == "redirect" else "/login?next=" + url.split("example.test")[-1]
        print("HTTP/2 307 Temporary Redirect\r\nLocation: " + target + "\r\n\r\n")
    elif url.endswith("sw.js"):
        print('const VERSION = "' + ("stale" if failure == "worker_version" else "new-build") + '";')
    else: print('{"display":"standalone"}')
''')
        helper.chmod(0o755)
        for name in ["id", "node", "git", "redis-cli", "sudo", "systemctl", "sleep", "npm", "curl"]:
            (self.project / "bin" / name).symlink_to(helper)
        (self.project / "backend/.venv/bin/python").symlink_to(helper)
        self.environment = {**os.environ, "PATH": f"{self.project / 'bin'}:{os.environ['PATH']}",
            "PROJECT_DIR": str(self.project), "DEPLOY_DOMAIN": "https://example.test",
            "MAINTENANCE_FILE": str(self.marker), "DEPLOY_LOCK_FILE": str(self.state / "lock"),
            "DEPLOY_LOG_DIR": str(self.state / "logs")}
        # flock is missing on macOS; the test exercises a fake successful lock only.
        (self.project / "bin/flock").write_text("#!/bin/sh\nexit 0\n")
        (self.project / "bin/flock").chmod(0o755)

    def run_script(self, failure="", flag="--apply"):
        (self.state / "failure").write_text(failure)
        return subprocess.run(["bash", str(self.script), flag], env=self.environment,
                              text=True, capture_output=True, timeout=30)

    def recorded(self):
        return [json.loads(line) for line in self.events.read_text().splitlines()]

    def test_default_plan_has_no_operational_side_effects(self):
        result = self.run_script(flag="--plan")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.events.exists())
        self.assertFalse(self.marker.exists())
        self.assertFalse((self.state / "logs").exists())

    def test_dirty_tree_is_rejected_before_fetch_or_maintenance(self):
        result = self.run_script("dirty")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.marker.exists())
        self.assertFalse(any(event[:2] == ["git", "fetch"] for event in self.recorded()))

    def test_success_stops_writers_backs_up_then_migrates_before_starting(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr + "\n" + "\n".join(p.read_text() for p in (self.state / "logs").glob("*.log")))
        events = self.recorded()
        backup = next(i for i, event in enumerate(events) if "backup_db" in event)
        migrate = next(i for i, event in enumerate(events) if "migrate" in event)
        merge = next(i for i, event in enumerate(events) if event[:2] == ["git", "merge"])
        stop = next(i for i, event in enumerate(events) if event[:4] == ["sudo", "-n", "systemctl", "stop"] and "conectado-concursos-worker.service" in event)
        start = next(i for i, event in enumerate(events) if event[:4] == ["sudo", "-n", "systemctl", "start"])
        self.assertLess(stop, backup)
        self.assertLess(backup, merge)
        self.assertLess(merge, migrate)
        self.assertLess(migrate, start)
        self.assertFalse(self.marker.exists())
        self.assertFalse(any("sync_sources" in event or "sync_questions" in event for event in events))

    def test_backup_failure_prevents_checkout_and_migration_and_keeps_maintenance(self):
        result = self.run_script("backup_db")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.marker.exists())
        self.assertFalse(any(event[:2] == ["git", "merge"] or "migrate" in event for event in self.recorded()))

    def test_migration_failure_never_starts_the_application(self):
        result = self.run_script("migrate")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.marker.exists())
        self.assertFalse(any(event[:4] == ["sudo", "-n", "systemctl", "start"] for event in self.recorded()))

    def test_bad_public_redirect_or_stale_worker_reactivates_maintenance(self):
        for failure in ["redirect", "worker_version"]:
            with self.subTest(failure=failure):
                if self.marker.exists(): self.marker.unlink()
                self.events.unlink(missing_ok=True)
                result = self.run_script(failure)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertTrue(self.marker.exists())
                self.assertNotIn("Atualização concluída", result.stdout)
                self.assertTrue(any(event[:4] == ["sudo", "-n", "systemctl", "stop"] for event in self.recorded()))
