import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import get_connection, send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


def _cipher():
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt_password(value: str) -> str:
    return _cipher().encrypt(value.encode()).decode()


def decrypt_password(value: str) -> str:
    return _cipher().decrypt(value.encode()).decode()


def smtp_status():
    from apps.backoffice.models import SMTPConfiguration

    config = SMTPConfiguration.objects.order_by("-updated_at").first()
    return config


def send_transactional_mail(subject: str, message: str, recipients: list[str]):
    config = smtp_status()
    if config and config.enabled:
        connection = get_connection(
            backend="django.core.mail.backends.smtp.EmailBackend",
            host=config.host,
            port=config.port,
            username=config.username,
            password=decrypt_password(config.password_encrypted) if config.password_encrypted else "",
            use_tls=config.use_tls,
            use_ssl=config.use_ssl,
            timeout=settings.EMAIL_TIMEOUT,
        )
        return send_mail(subject, message, config.from_email, recipients, connection=connection)
    return send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, recipients)


def send_password_reset_link(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    return send_transactional_mail(
        "Redefinição de senha — Conectado em Questões",
        f"Use este link para criar uma nova senha: {url}",
        [user.email],
    )
