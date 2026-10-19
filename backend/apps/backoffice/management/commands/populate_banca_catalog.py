import json
from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError
from apps.backoffice.audit import audited_command
from apps.backoffice.banca_catalog import DEFAULT_CATALOG, populate_catalog


class Command(BaseCommand):
    help = 'Simula ou cadastra bancas revisadas e vincula provas por nome/alias exato. Sem consultas externas.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Gravar após backup operacional.')
        parser.add_argument('--catalog', default=str(DEFAULT_CATALOG))

    @audited_command('populate_banca_catalog')
    def handle(self, *args, **options):
        try:
            result = populate_catalog(options['catalog'], apply=options['apply'])
        except (ValidationError, ValueError, KeyError, OSError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True))
