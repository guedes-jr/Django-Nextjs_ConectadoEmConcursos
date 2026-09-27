"""Audita valores de banca sem modificar os registros existentes."""

from collections import Counter
import json
import unicodedata

from django.core.management.base import BaseCommand

from apps.questions.models import Exam, Question


def normalize_banca_candidate(value: str) -> str:
    """Normalização diagnóstica para agrupar candidatos a alias.

    Não é a normalização definitiva do catálogo: a função existe para tornar a
    auditoria reproduzível antes de se definir aliases e nomes canônicos.
    """

    normalized = unicodedata.normalize("NFKC", value or "")
    return " ".join(normalized.split()).casefold()


class Command(BaseCommand):
    help = "Lista as bancas de questões e provas para preparar o catálogo, sem gravar dados."

    def add_arguments(self, parser):
        parser.add_argument(
            "--format",
            choices=("table", "json"),
            default="table",
            help="Formato da saída (padrão: table).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Máximo de grupos exibidos; 0 mostra todos.",
        )

    def handle(self, *args, **options):
        question_counts = Counter(
            value
            for value in Question.objects.values_list("banca", flat=True).iterator()
            if value and value.strip()
        )
        exam_counts = Counter(
            value
            for value in Exam.objects.values_list("banca", flat=True).iterator()
            if value and value.strip()
        )

        values = set(question_counts) | set(exam_counts)
        groups = {}
        for value in values:
            candidate = normalize_banca_candidate(value)
            if not candidate:
                continue
            group = groups.setdefault(
                candidate,
                {"normalized": candidate, "variants": [], "questions": 0, "exams": 0},
            )
            group["variants"].append(value)
            group["questions"] += question_counts[value]
            group["exams"] += exam_counts[value]

        rows = []
        for group in groups.values():
            group["variants"].sort(key=str.casefold)
            group["total"] = group["questions"] + group["exams"]
            rows.append(group)
        rows.sort(key=lambda row: (-row["total"], row["normalized"]))

        limit = options["limit"]
        visible_rows = rows[:limit] if limit > 0 else rows
        payload = {
            "distinct_raw_values": len(values),
            "distinct_normalized_candidates": len(rows),
            "question_records_with_banca": sum(question_counts.values()),
            "exam_records_with_banca": sum(exam_counts.values()),
            "groups_with_variants": sum(len(row["variants"]) > 1 for row in rows),
            "results": visible_rows,
        }

        if options["format"] == "json":
            self.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2))
            return

        self.stdout.write("Auditoria de bancas (somente leitura)")
        self.stdout.write(
            "Valores brutos: {distinct_raw_values} | candidatos normalizados: "
            "{distinct_normalized_candidates} | grupos com variantes: {groups_with_variants}".format(
                **payload
            )
        )
        self.stdout.write(
            "Registros: {question_records_with_banca} questões | {exam_records_with_banca} provas".format(
                **payload
            )
        )
        for row in visible_rows:
            variants = " | ".join(row["variants"])
            self.stdout.write(
                f"- {variants} — {row['questions']} questão(ões), "
                f"{row['exams']} prova(s)"
            )
