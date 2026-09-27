"""Executa uma busca em uma fonte de questões e registra o `SearchRun`.

Uma execução é de **uma** fonte: `--source` com vírgula é erro de propósito, para
nunca misturar conteúdo de origens diferentes na mesma fila de aprovação.
"""

import json

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.questions.ingest import run
from apps.questions.models import QuestionSource


class Command(BaseCommand):
    help = "Busca questões em uma fonte e grava o resultado como execução de busca."

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, help="Slug de uma única QuestionSource.")
        parser.add_argument("--filters-json", default="{}", help='Filtros em JSON, ex.: {"banca": "CEBRASPE"}.')
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--page", type=int, default=1)
        parser.add_argument("--parent", type=int, default=None, help="Execução a continuar.")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        slugs = [part.strip() for part in options["source"].split(",") if part.strip()]
        if len(slugs) != 1:
            raise CommandError("Informe uma fonte por execução.")
        try:
            source = QuestionSource.objects.get(slug=slugs[0])
        except QuestionSource.DoesNotExist:
            raise CommandError(f"Fonte desconhecida: {slugs[0]}") from None

        try:
            filters = json.loads(options["filters_json"] or "{}")
        except json.JSONDecodeError as exc:
            raise CommandError(f"Filtros inválidos: {exc}") from exc
        if not isinstance(filters, dict):
            raise CommandError("Filtros inválidos: use um objeto JSON.")

        parent = None
        if options["parent"]:
            from apps.questions.models import SearchRun

            parent = SearchRun.objects.filter(pk=options["parent"]).first()

        try:
            run_record = run(
                source,
                filters,
                limit=options["limit"],
                page=options["page"],
                parent=parent,
                dry_run=options["dry_run"],
            )
        except ValidationError as exc:
            messages = (
                [f"{field}: {', '.join(items)}" for field, items in exc.message_dict.items()]
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            )
            raise CommandError("; ".join(messages)) from exc
        except Exception as exc:  # adapter sem configuração, rede fora, formato inesperado
            raise CommandError(f"Falha na execução: {exc}") from exc

        counts = run_record.counts or {}
        self.stdout.write(
            self.style.SUCCESS(
                f"Execução #{run_record.pk} ({run_record.get_status_display()}): "
                f"{counts.get('created', 0)} criada(s), {counts.get('updated', 0)} atualizada(s), "
                f"{counts.get('duplicates_skipped', 0)} duplicata(s) pulada(s), "
                f"{counts.get('invalidations', 0)} voltaram para a fila, "
                f"{counts.get('errors', 0)} com erro."
            )
        )
        if run_record.next_page:
            self.stdout.write(f"Continua na página {run_record.next_page}.")
