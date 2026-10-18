import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory

from django.conf import settings
from django.test import SimpleTestCase


class ProductionFrontendEnvironmentTests(SimpleTestCase):
    def test_next_environment_loader_accepts_public_origins_and_rejects_unsafe_values(self):
        node = shutil.which("node")
        frontend = settings.BASE_DIR.parent / "frontend"
        if not node or not (frontend / "node_modules/next").exists():
            self.skipTest("Frontend dependencies and Node are required for this focused integration check")
        script = frontend / "scripts/check-production-env.mjs"
        with TemporaryDirectory(prefix="conectado-public-env-") as temporary:
            # Never load the developer's .env. All test values are synthetic.
            (Path(temporary) / ".env.production").write_text("NEXT_PUBLIC_BACKEND_URL=https://api.example.test\n")
            environment = {"PATH": os.environ["PATH"], "NODE_ENV": "production"}
            cases = [("https://api.example.test", True), ("http://localhost:8000", False),
                     ("https://127.0.0.1", False), ("https://api.example.test/api", False),
                     ("https://user:synthetic-password@api.example.test", False)]
            for value, valid in cases:
                with self.subTest(value=value):
                    result = subprocess.run([node, str(script)], cwd=temporary,
                        env={**environment, "NEXT_PUBLIC_API_BASE_URL": value}, capture_output=True, text=True, timeout=15)
                    self.assertEqual(result.returncode == 0, valid, result.stdout + result.stderr)
                    self.assertNotIn("synthetic-password", result.stdout + result.stderr)
