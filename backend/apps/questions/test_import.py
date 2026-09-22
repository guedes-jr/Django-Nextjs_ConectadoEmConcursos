import json
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from apps.questions.models import Exam, Question


class ImportContentTests(TestCase):
    def test_imports_json_and_is_idempotent(self):
        payload = [{
            "exam_title": "Prova exemplo", "banca": "CEBRASPE", "year": 2026,
            "institution": "Órgão", "role": "Analista", "discipline": "Português",
            "statement": "Assinale a alternativa correta.", "options": ["A", "B"],
            "correct_answer": 1, "explanation": "A resposta é B."
        }]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "content.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            call_command("import_content", str(path))
            call_command("import_content", str(path))
        self.assertEqual(Exam.objects.count(), 1)
        self.assertEqual(Question.objects.count(), 1)

    def test_dry_run_validates_without_saving(self):
        payload = [{
            "banca": "FGV", "year": 2025, "discipline": "Direito",
            "statement": "Enunciado", "options": ["Certo", "Errado"], "correct_answer": 0
        }]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "content.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            call_command("import_content", str(path), dry_run=True)
        self.assertFalse(Question.objects.exists())
