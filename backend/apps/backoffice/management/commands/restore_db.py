from apps.backoffice.audit import audited_command
from django.core.management.base import BaseCommand, CommandError

from apps.backoffice.services import restore_backup


class Command(BaseCommand):
    help = "Restaura um backup a partir de backups/backup-<timestamp>.tar.gz."

    def add_arguments(self, parser):
        parser.add_argument("--maintenance", action="store_true", help="Declara que aplicação e workers estão parados.")
        parser.add_argument("--confirm", action="store_true", help="Confirma substituição do banco e mídia configurados.")
        parser.add_argument("name", nargs="?", help="Nome do arquivo de backup (ex.: backup-20260922-120000.tar.gz)")

    @audited_command("restore_db")
    def handle(self, *args, **options):
        name = options.get("name")
        if not name:
            raise CommandError("Informe o nome do backup: manage.py restore_db <backup-XXXX.tar.gz>")
        try:
            from apps.backoffice.backup_storage import engine
            if engine() == "postgresql" and not (options["maintenance"] and options["confirm"]):
                raise CommandError("PostgreSQL exige --maintenance --confirm após parar aplicação e workers.")
            result = restore_backup(name, maintenance=options["maintenance"] and options["confirm"])
        except ValueError as exc:
            raise CommandError(str(exc))
        self.stdout.write(self.style.SUCCESS(f"Backup restaurado: {result['restored']}"))
        self.stdout.write(f"Banco anterior salvo em: {result['previous_db_saved_at']}")
        if result.get("previous_media_saved_at"):
            self.stdout.write(f"Mídia anterior preservada em: {result['previous_media_saved_at']}")
        self.stdout.write(self.style.WARNING("Reinicie o servidor do Django após restaurar."))