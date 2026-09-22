import csv
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.questions.models import Exam, Question


class Command(BaseCommand):
    help = "Importa provas e questões de um arquivo JSON ou CSV validado."

    def add_arguments(self, parser):
        parser.add_argument("file")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["file"])
        if not path.is_file() or path.suffix.lower() not in {".json", ".csv"}:
            raise CommandError("Informe um arquivo .json ou .csv existente.")
        rows = self._read(path)
        imported = 0
        try:
            with transaction.atomic():
                for number, row in enumerate(rows, start=1):
                    self._import_row(row, number)
                    imported += 1
                if options["dry_run"]:
                    transaction.set_rollback(True)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise CommandError(f"Conteúdo inválido: {exc}") from exc
        suffix = " (simulação; nada foi salvo)" if options["dry_run"] else ""
        self.stdout.write(self.style.SUCCESS(f"{imported} questão(ões) processada(s){suffix}."))

    def _read(self, path):
        with path.open(encoding="utf-8-sig", newline="") as source:
            if path.suffix.lower() == ".json":
                payload = json.load(source)
                return payload["questions"] if isinstance(payload, dict) else payload
            return list(csv.DictReader(source))

    def _import_row(self, row, number):
        options = row["options"]
        if isinstance(options, str):
            options = json.loads(options)
        if not isinstance(options, list) or len(options) < 2:
            raise ValueError(f"linha {number}: options deve conter ao menos duas alternativas")
        correct = int(row["correct_answer"])
        if correct < 0 or correct >= len(options):
            raise ValueError(f"linha {number}: correct_answer fora do intervalo")
        exam = None
        title = str(row.get("exam_title", "")).strip()
        if title:
            exam, _ = Exam.objects.update_or_create(
                title=title,
                banca=str(row["banca"]).strip(),
                year=int(row["year"]),
                defaults={
                    "institution": str(row.get("institution", "")).strip(),
                    "role": str(row.get("role", "")).strip(),
                    "is_published": self._boolean(row.get("is_published", True)),
                },
            )
        lookup = {
            "statement": str(row["statement"]).strip(),
            "banca": str(row["banca"]).strip(),
            "year": int(row["year"]),
        }
        Question.objects.update_or_create(
            **lookup,
            defaults={
                "exam": exam,
                "discipline": str(row["discipline"]).strip(),
                "options": options,
                "correct_answer": correct,
                "explanation": str(row.get("explanation", "")).strip(),
                "is_active": self._boolean(row.get("is_active", True)),
            },
        )

    @staticmethod
    def _boolean(value):
        return value if isinstance(value, bool) else str(value).strip().lower() not in {"0", "false", "não", "nao"}
