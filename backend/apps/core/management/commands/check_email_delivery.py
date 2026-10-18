from smtplib import SMTPException

from django.conf import settings
from django.core.mail import get_connection, send_mail
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from apps.backoffice.audit import audited_command


class Command(BaseCommand):
    help = "Valida configuração de e-mail; conexão/envio somente com opção explícita."

    def add_arguments(self, parser):
        parser.add_argument("--smtp-connect", action="store_true", help="Abre e fecha a conexão SMTP, sem enviar mensagem.")
        parser.add_argument("--send-to", help="Envia uma mensagem de homologação ao endereço informado explicitamente.")

    @audited_command("check_email_delivery")
    def handle(self, *args, **options):
        from apps.core.deployment_checks import email_transport_checks
        if email_transport_checks(None):
            raise CommandError("Configuração TLS/SSL/timeout inválida; execute manage.py check.")
        if options["smtp_connect"] or options["send_to"]:
            if settings.EMAIL_BACKEND != "django.core.mail.backends.smtp.EmailBackend":
                raise CommandError("A sondagem de entrega exige backend SMTP; console/locmem não comprovam entrega.")
            try:
                if options["send_to"]:
                    validate_email(options["send_to"])
                    count = send_mail("Teste de entrega — Conectado em Questões", "Mensagem de homologação do transporte transacional.",
                                      settings.DEFAULT_FROM_EMAIL, [options["send_to"]])
                    if count != 1:
                        raise CommandError("O transporte não confirmou aceitação da mensagem.")
                    self.stdout.write("Mensagem aceita pelo transporte; confirme o recebimento na caixa de destino.")
                else:
                    with get_connection():
                        self.stdout.write("Conexão SMTP aberta e encerrada, sem envio.")
            except (SMTPException, OSError, ValidationError) as exc:
                raise CommandError("Falha na sondagem SMTP. Verifique configuração e credenciais no servidor.") from exc
        else:
            self.stdout.write("Configuração TLS/SSL/timeout válida. Nenhuma conexão ou mensagem foi realizada.")
            self.stdout.write("Use check --deploy para avaliar os requisitos de produção.")
