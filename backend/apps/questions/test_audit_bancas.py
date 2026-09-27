import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.questions.models import Exam, Question


class AuditBancasCommandTests(TestCase):
    def test_groups_variants_without_writing_data(self):
        exam = Exam.objects.create(title="Prova", banca="CEBRASPE", year=2024)
        Question.objects.create(
            discipline="Direito",
            banca=" cebraspe ",
            year=2024,
            statement="Enunciado para auditoria.",
            options=["A", "B"],
            correct_answer=0,
            exam=exam,
        )

        output = StringIO()
        call_command("audit_bancas", "--format=json", stdout=output)

        payload = json.loads(output.getvalue())
        self.assertEqual(payload["distinct_raw_values"], 2)
        self.assertEqual(payload["distinct_normalized_candidates"], 1)
        self.assertEqual(payload["groups_with_variants"], 1)
        self.assertEqual(payload["results"][0]["questions"], 1)
        self.assertEqual(payload["results"][0]["exams"], 1)
        exam.refresh_from_db()
        self.assertEqual(exam.banca, "CEBRASPE")
