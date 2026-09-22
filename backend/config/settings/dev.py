from .base import *  # noqa

DEBUG = True
SECRET_KEY = SECRET_KEY or "django-insecure-development-only"
ALLOWED_HOSTS = ALLOWED_HOSTS or ["localhost", "127.0.0.1"]
CORS_ALLOWED_ORIGINS = CORS_ALLOWED_ORIGINS or ["http://localhost:3000"]
CSRF_TRUSTED_ORIGINS = CSRF_TRUSTED_ORIGINS or ["http://localhost:3000"]
