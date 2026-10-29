from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.email_delivery import encrypt_password, send_transactional_mail
from .audit import log as audit_log
from .models import SMTPConfiguration
from .permissions import SuperuserAccess


def payload(config):
    if config:
        return {
            "source": "admin", "configured": True, "enabled": config.enabled,
            "host": config.host, "port": config.port, "username": config.username,
            "has_password": bool(config.password_encrypted), "use_tls": config.use_tls,
            "use_ssl": config.use_ssl, "from_email": config.from_email,
            "updated_at": config.updated_at, "updated_by": config.updated_by_id,
        }
    return {
        "source": "environment", "configured": settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend",
        "enabled": settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend",
        "host": settings.EMAIL_HOST, "port": settings.EMAIL_PORT, "username": settings.EMAIL_HOST_USER,
        "has_password": bool(settings.EMAIL_HOST_PASSWORD), "use_tls": settings.EMAIL_USE_TLS,
        "use_ssl": settings.EMAIL_USE_SSL, "from_email": settings.DEFAULT_FROM_EMAIL,
    }


@api_view(["GET", "PUT"])
@permission_classes([SuperuserAccess])
def smtp_configuration(request):
    config = SMTPConfiguration.objects.order_by("-updated_at").first()
    if request.method == "GET":
        return Response(payload(config))

    fields = request.data
    host = str(fields.get("host", "")).strip()
    username = str(fields.get("username", "")).strip()
    from_email = str(fields.get("from_email", "")).strip()
    try:
        port = int(fields.get("port", 0))
        validate_email(from_email)
    except (TypeError, ValueError, ValidationError):
        return Response({"detail": "Informe host, porta e e-mail remetente válidos."}, status=status.HTTP_400_BAD_REQUEST)
    if not host or not 1 <= port <= 65535:
        return Response({"detail": "Informe host e porta SMTP válidos."}, status=status.HTTP_400_BAD_REQUEST)
    use_tls = bool(fields.get("use_tls", False))
    use_ssl = bool(fields.get("use_ssl", False))
    if use_tls and use_ssl:
        return Response({"detail": "Use TLS ou SSL, não os dois ao mesmo tempo."}, status=status.HTTP_400_BAD_REQUEST)
    config = config or SMTPConfiguration()
    config.host, config.port, config.username = host, port, username
    config.use_tls, config.use_ssl = use_tls, use_ssl
    config.from_email = from_email
    config.enabled = bool(fields.get("enabled", True))
    password = fields.get("password")
    if password:
        config.password_encrypted = encrypt_password(str(password))
    config.updated_by = request.user
    config.save()
    audit_log(request, action="settings.smtp_updated", resource_type="smtp", resource_id=config.id,
              after={"host": host, "port": port, "username": username, "use_tls": use_tls, "use_ssl": use_ssl, "from_email": from_email, "enabled": config.enabled})
    return Response(payload(config))


@api_view(["POST"])
@permission_classes([SuperuserAccess])
def smtp_test(request):
    recipient = str(request.data.get("email", "")).strip()
    try:
        validate_email(recipient)
        send_transactional_mail("Teste SMTP — Conectado em Questões", "Se você recebeu esta mensagem, a configuração SMTP está funcionando.", [recipient])
    except Exception:
        return Response({"detail": "Não foi possível enviar o teste. Revise host, porta, credenciais e TLS/SSL."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    audit_log(request, action="settings.smtp_tested", resource_type="smtp", resource_id="current", after={"recipient": recipient})
    return Response({"detail": "E-mail de teste enviado."})
