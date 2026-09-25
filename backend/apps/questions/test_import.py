import json
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from apps.questions.models import Exam, Question
from apps.questions.management.commands.import_content import CURATED_XML_EXPLANATIONS
from apps.questions.naming import normalize_discipline


class NormalizeDisciplineTests(TestCase):
    def test_adds_missing_accents_and_capitalization(self):
        cases = {
            "Portugues": "Português",
            "Raciocinio Logico": "Raciocínio Lógico",
            "Informatica": "Informática",
            "Gestao De Pessoas": "Gestão de Pessoas",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_discipline(raw), expected)

    def test_handles_renames_and_acronyms(self):
        self.assertEqual(normalize_discipline("Administracao Recursos Materiais"), "Administração de Recursos Materiais")
        self.assertEqual(normalize_discipline("Eca"), "ECA")
        self.assertEqual(normalize_discipline("Afo"), "AFO")
        self.assertEqual(normalize_discipline("Etica Administracao"), "Ética Administração")

    def test_keeps_already_correct_names(self):
        self.assertEqual(normalize_discipline("Direito Penal"), "Direito Penal")
        self.assertEqual(normalize_discipline("Português"), "Português")
        self.assertIsNone(normalize_discipline(None))
        self.assertEqual(normalize_discipline(""), "")


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

    def test_xml_preserves_exam_links_and_rich_question_content(self):
        xml = """<questions>
          <question id="source-1"><subject>direito_administrativo</subject><institution>fgv</institution>
            <year>2025</year><exam_name>Prova A</exam_name><statement>&lt;p&gt;Texto&lt;/p&gt;</statement>
            <command>&lt;p&gt;QUESTÃO 20 – Qual alternativa?&lt;/p&gt;</command><correct_answer>B</correct_answer>
            <options><option letter="A">&lt;p&gt;Não&lt;/p&gt;</option><option letter="B">&lt;p&gt;Sim&lt;/p&gt;</option></options>
          </question>
          <question id="source-2"><subject>direito_administrativo</subject><institution>fgv</institution>
            <year>2025</year><exam_name>Prova B</exam_name><statement>&lt;p&gt;Texto&lt;/p&gt;</statement>
            <command>&lt;p&gt;Qual alternativa?&lt;/p&gt;</command><correct_answer>B</correct_answer>
            <options><option letter="A">&lt;p&gt;Não&lt;/p&gt;</option><option letter="B">&lt;p&gt;Sim&lt;/p&gt;</option></options>
          </question>
        </questions>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "questions.xml"
            path.write_text(xml, encoding="utf-8")
            call_command("import_content", str(path))
            call_command("import_content", str(path))
        self.assertEqual(Question.objects.count(), 2)
        self.assertEqual(Exam.objects.count(), 2)
        question = Question.objects.get(source_id="source-1")
        self.assertEqual(question.statement, "Texto\n\nQual alternativa?")
        self.assertEqual(question.correct_answer, 1)
        self.assertEqual(question.options, ["Não", "Sim"])

    def test_xml_applies_curated_comment_and_does_not_erase_existing_comment(self):
        source_id = next(iter(CURATED_XML_EXPLANATIONS))
        xml = f"""<questions><question id="{source_id}">
            <subject>teste</subject><institution>fgv</institution><year>2025</year>
            <statement>Enunciado</statement><correct_answer>A</correct_answer>
            <options><option letter="A">Sim</option><option letter="B">Não</option></options>
        </question></questions>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "questions.xml"
            path.write_text(xml, encoding="utf-8")
            call_command("import_content", str(path))
            question = Question.objects.get(source_id=source_id)
            self.assertEqual(question.explanation, CURATED_XML_EXPLANATIONS[source_id])
            question.explanation = "Comentário revisado na administração."
            question.save(update_fields=["explanation"])
            call_command("import_content", str(path))
        self.assertEqual(Question.objects.get(source_id=source_id).explanation, "Comentário revisado na administração.")
