import csv
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.questions.models import Exam, Question


CURATED_XML_EXPLANATIONS = json.loads(
    (Path(__file__).resolve().parents[2] / "data" / "xml_explanations.json").read_text(encoding="utf-8")
)


class QuestionHTMLParser(HTMLParser):
    """Convert the exported rich text to readable text and safe image markers."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3", "ul", "ol", "blockquote"}:
            self.parts.append("\n")
        if tag == "li":
            self.parts.append("• ")
        if tag == "img":
            src = dict(attrs).get("src", "")
            if re.match(r"^https://[^\s]+$", src) or re.match(
                r"^data:image/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$", src
            ):
                self.parts.append(f"\n[[image:{src}]]\n")

    def handle_endtag(self, tag):
        if tag in {"p", "div", "li", "h1", "h2", "h3", "blockquote"}:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)

    def text(self):
        return re.sub(r"\n{3,}", "\n\n", "".join(self.parts)).strip()


def rich_text(value):
    parser = QuestionHTMLParser()
    parser.feed(value or "")
    return parser.text()


def without_question_number(value):
    return re.sub(
        r"^QUEST[ÃA]O\s*(?:N[º°.]?\s*)?\d+\s*(?:[.°º:–—-]\s*)?",
        "",
        value,
        count=1,
        flags=re.IGNORECASE,
    ).strip()


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
            rows = self._read(path)
        except (ElementTree.ParseError, KeyError, TypeError, ValueError) as exc:
            raise CommandError(f"Conteúdo inválido: {exc}") from exc
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
        if path.suffix.lower() == ".xml":
            root = ElementTree.parse(path).getroot()
            if root.tag != "questions":
                raise ValueError("a raiz do XML deve ser <questions>")
            return [self._xml_row(question, number) for number, question in enumerate(root, 1)]
        with path.open(encoding="utf-8-sig", newline="") as source:
            if path.suffix.lower() == ".json":
                payload = json.load(source)
                return payload["questions"] if isinstance(payload, dict) else payload
            return list(csv.DictReader(source))

    @staticmethod
    def _xml_row(question, number):
        if question.tag != "question":
            raise ValueError(f"item {number}: esperado <question>")
        options = question.find("options")
        if options is None:
            raise ValueError(f"item {number}: alternativas ausentes")
        letters = [option.get("letter", "").strip().upper() for option in options]
        answer = (question.findtext("correct_answer") or "").strip().upper()
        if answer not in letters or len(set(letters)) != len(letters):
            raise ValueError(f"item {number}: gabarito ou letras inválidas")
        statement = "\n\n".join(filter(None, [
            without_question_number(rich_text(question.findtext("statement"))),
            without_question_number(rich_text(question.findtext("command"))),
        ]))
        if not statement:
            raise ValueError(f"item {number}: enunciado vazio")
        xml_explanation = rich_text(question.findtext("explanation"))
        return {
            "source_id": (question.get("id") or "").strip() or None,
            "exam_title": (question.findtext("exam_name") or "").strip(),
            "banca": (question.findtext("institution") or "").strip().upper(),
            "year": question.findtext("year"),
            "role": (question.findtext("cargo") or "").replace("_", " ").title(),
            "discipline": (question.findtext("subject") or "").replace("_", " ").title(),
            "statement": statement,
            "options": [rich_text(option.text) or "[Alternativa sem conteúdo no arquivo de origem]" for option in options],
            "correct_answer": letters.index(answer),
            "explanation": xml_explanation
            or CURATED_XML_EXPLANATIONS.get((question.get("id") or "").strip(), ""),
            "curated_explanation": not bool(xml_explanation),
        }

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
        source_id = row.get("source_id")
        lookup = {"source_id": source_id} if source_id else {
            "statement": str(row["statement"]).strip(),
            "banca": str(row["banca"]).strip(),
            "year": int(row["year"]),
        }
        explanation = str(row.get("explanation", "")).strip()
        if not explanation or row.get("curated_explanation"):
            existing = Question.objects.filter(**lookup).only("explanation").first()
            if existing and existing.explanation:
                explanation = existing.explanation
        Question.objects.update_or_create(
            **lookup,
            defaults={
                "exam": exam,
                "statement": str(row["statement"]).strip(),
                "banca": str(row["banca"]).strip(),
                "year": int(row["year"]),
                "discipline": str(row["discipline"]).strip(),
                "options": options,
                "correct_answer": correct,
                "explanation": explanation,
                "is_active": self._boolean(row.get("is_active", True)),
            },
        )

    @staticmethod
    def _boolean(value):
        return value if isinstance(value, bool) else str(value).strip().lower() not in {"0", "false", "não", "nao"}
