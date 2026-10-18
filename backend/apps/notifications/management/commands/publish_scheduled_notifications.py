from apps.backoffice.audit import audited_command
from django.core.management.base import BaseCommand
from apps.notifications.delivery import publish_due
class Command(BaseCommand):
    help = "Publica avisos administrativos cujo agendamento venceu."
    @audited_command("publish_scheduled_notifications")
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"{publish_due()} aviso(s) publicado(s)."))
