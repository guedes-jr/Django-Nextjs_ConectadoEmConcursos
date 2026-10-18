"""Hermetic checks/tests: never read local dotenv or connect to operational services."""
import os
from pathlib import Path

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
from .dev import *  # noqa: E402,F403

SECRET_KEY = "isolated-test-key-not-for-deployment"
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
TEST_ROOT = Path(os.environ.get("E2E_TMP_DIR", "/tmp/conectado-ci"))
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": TEST_ROOT / "test.sqlite3"}}
MEDIA_ROOT = TEST_ROOT / "media"
BACKUP_DIR = TEST_ROOT / "backups"
OFFICIAL_EXAMS_ROOT = TEST_ROOT / "private"
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
EMAIL_USE_TLS = False
EMAIL_USE_SSL = False
EMAIL_HOST_PASSWORD = ""
STRIPE_SECRET_KEY = ""
STRIPE_WEBHOOK_SECRET = ""
STRIPE_PRICE_IDS = {}
STRIPE_LIVE_MODE = False
OPENAI_API_KEY = ""
OPENROUTER_API_KEY = ""
GOOGLE_CLIENT_ID = ""
GOOGLE_CLIENT_SECRET = ""
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
Q_CLUSTER = {"name": "isolated-tests", "sync": True, "orm": "default", "timeout": 60, "retry": 120}
FRONTEND_URL = "http://127.0.0.1:3100"
CORS_ALLOWED_ORIGINS = [FRONTEND_URL]
CSRF_TRUSTED_ORIGINS = [FRONTEND_URL]
DIAGNOSTICS_ENABLED = False
