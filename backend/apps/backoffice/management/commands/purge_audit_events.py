from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.backoffice.models import AuditEvent


class Command(BaseCommand):
    help = "Lista ou remove eventos de auditoria vencidos; a remoção exige --confirm."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true")

    def handle(self, *args, **opts):
        retention_days = int(getattr(settings, "AUDIT_RETENTION_DAYS", 365))
        if retention_days < 30:
            raise CommandError("AUDIT_RETENTION_DAYS deve ser de pelo menos 30 dias.")
        cutoff = timezone.now() - timedelta(days=retention_days)
        queryset = AuditEvent.objects.filter(created_at__lt=cutoff)
        count = queryset.count()
        if not opts["confirm"]:
            self.stdout.write(f"{count} evento(s) elegíveis; execute com --confirm para remover.")
            return
        queryset.delete()
        AuditEvent.objects.create(
            action="audit.retention.purged",
            resource_type="audit_event",
            context={"retention_days": retention_days, "cutoff": cutoff.isoformat(), "deleted_count": count, "command": "purge_audit_events"},
        )
        self.stdout.write(self.style.SUCCESS(f"{count} evento(s) removido(s); execução registrada na auditoria."))
