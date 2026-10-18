"""Static deployment checks: no network calls, mail delivery or filesystem writes."""
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from django.core.checks import Error, Warning, Tags, register


@register(Tags.security)
def email_transport_checks(app_configs, **kwargs):
    errors = []
    if settings.EMAIL_USE_SSL and settings.EMAIL_USE_TLS:
        errors.append(Error("Use somente EMAIL_USE_TLS ou EMAIL_USE_SSL.", id="core.E001"))
    if not isinstance(settings.EMAIL_TIMEOUT, (int, float)) or settings.EMAIL_TIMEOUT <= 0:
        errors.append(Error("EMAIL_TIMEOUT deve ser positivo.", id="core.E002"))
    return errors


@register(Tags.security, deploy=True)
def deployment_storage_email_checks(app_configs, **kwargs):
    issues = []
    if not all(Path(value).is_absolute() for value in (settings.MEDIA_ROOT, settings.BACKUP_DIR, settings.OFFICIAL_EXAMS_ROOT)):
        issues.append(Error("Diretórios persistentes devem usar caminhos absolutos em produção.", id="core.E007"))
    media = Path(settings.MEDIA_ROOT).resolve()
    backups = Path(settings.BACKUP_DIR).resolve()
    private = Path(settings.OFFICIAL_EXAMS_ROOT).resolve()
    base = Path(settings.BASE_DIR).resolve()
    if backups.is_relative_to(media) or media.is_relative_to(backups):
        issues.append(Error("Mídia pública e backups devem usar diretórios separados.", id="core.E003"))
    if private.is_relative_to(media) or media.is_relative_to(private):
        issues.append(Error("O acervo privado deve ficar fora da mídia pública.", id="core.E004"))
    if media.is_relative_to(base):
        issues.append(Warning("MEDIA_ROOT fica no diretório de código; provisione um volume persistente externo ao release.", id="core.W001"))
    if backups.is_relative_to(base):
        issues.append(Warning("BACKUP_DIR fica no diretório de código; use armazenamento persistente e cópia externa.", id="core.W002"))
    if settings.EMAIL_BACKEND != "django.core.mail.backends.smtp.EmailBackend":
        issues.append(Warning("O backend de e-mail não é SMTP; valide explicitamente o transporte de produção.", id="core.W003"))
    elif not settings.EMAIL_HOST:
        issues.append(Error("EMAIL_HOST é obrigatório para o transporte SMTP.", id="core.E005"))
    if not settings.EMAIL_USE_SSL and not settings.EMAIL_USE_TLS and settings.EMAIL_HOST not in {"localhost", "127.0.0.1", "::1"}:
        issues.append(Warning("SMTP remoto está sem TLS/SSL; confirme se há relay protegido.", id="core.W004"))
    sender = settings.DEFAULT_FROM_EMAIL
    if not sender or ".local" in sender:
        issues.append(Warning("Configure DEFAULT_FROM_EMAIL com domínio remetente verificado.", id="core.W005"))
    if urlparse(settings.FRONTEND_URL).scheme != "https":
        issues.append(Warning("FRONTEND_URL deve usar HTTPS em produção para links transacionais.", id="core.W006"))
    if not settings.MEDIA_URL.endswith("/"):
        issues.append(Error("MEDIA_URL deve terminar com /.", id="core.E006"))
    return issues
