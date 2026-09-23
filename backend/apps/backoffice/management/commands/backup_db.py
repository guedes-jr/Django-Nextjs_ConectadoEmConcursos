from django.core.management.base import BaseCommand

from apps.backoffice.services import create_backup, list_backups


class Command(BaseCommand):
    help = "Cria um backup compactado (banco + mídia) em backups/."

    def handle(self, *args, **options):
        name = create_backup()
        backups = list_backups()
        self.stdout.write(self.style.SUCCESS(f"Backup criado: {name}"))
        self.stdout.write(f"Backups disponíveis: {len(backups)}")
        for item in backups[:5]:
            self.stdout.write(f"  - {item['name']} ({item['size']} bytes)")