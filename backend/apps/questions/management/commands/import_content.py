"""Importa provas e questões de um arquivo JSON, CSV ou XML validado.

O trabalho de ler, gravar e decidir está em `apps.questions.ingest`; este comando
mantém a CLI de sempre e vira só uma casca em cima do pipeline. O que mudou de
verdade: cada execução cria um `SearchRun` e **nada entra no ar sem passar pela
fila de aprovação** — o que já estava publicado continua como estava.
"""

from pathlib import Path
from xml.etree import ElementTree

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.questions.ingest import run_file

# Reexportado para quem já importava as revisões daqui.
from apps.questions.ingest.parsers import CURATED_XML_EXPLANATIONS  # noqa: F401


class Command(BaseCommand):
    help = "Importa provas e questões de um arquivo JSON, CSV ou XML validado."

    def add_arguments(self, parser):
        parser.add_argument("file")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["file"])
        if not path.is_file() or path.suffix.lower() not in {".json", ".csv", ".xml"}:
            raise CommandError("Informe um arquivo .json, .csv ou .xml existente.")
        try:
            run = run_file(path, dry_run=options["dry_run"])
        except (ElementTree.ParseError, KeyError, TypeError, ValueError) as exc:
            raise CommandError(f"Conteúdo inválido: {exc}") from exc
        except ValidationError as exc:
            raise CommandError("; ".join(_messages(exc))) from exc

        counts = run.counts or {}
        suffix = " (simulação; nada foi salvo)" if options["dry_run"] else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{counts.get('created', 0)} questão(ões) criada(s), "
                f"{counts.get('updated', 0)} atualizada(s), "
                f"{counts.get('duplicates_skipped', 0)} pulada(s) por duplicata, "
                f"{counts.get('errors', 0)} com erro — execução #{run.pk}{suffix}."
            )
        )
        if counts.get("pending"):
            self.stdout.write(
                f"{counts['pending']} questão(ões) entraram na fila de aprovação (status pendente)."
            )


def _messages(exc: ValidationError) -> list[str]:
    if hasattr(exc, "message_dict"):
        return [f"{field}: {', '.join(messages)}" for field, messages in exc.message_dict.items()]
    return list(exc.messages)
