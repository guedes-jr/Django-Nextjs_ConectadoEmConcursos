import json
from django.core.management.base import BaseCommand, CommandError
from apps.backoffice.routines import CATALOG, dispatch


class Command(BaseCommand):
    help = "Executa somente as rotinas operacionais vencidas configuradas no painel."

    def add_arguments(self, parser):
        parser.add_argument("--routine", action="append", choices=list(CATALOG))

    def handle(self, *args, **options):
        result = dispatch(options["routine"])
        self.stdout.write(json.dumps(result))
        if result["error"]:
            raise CommandError("Uma ou mais rotinas falharam; consulte os diagnósticos de rotinas.")
