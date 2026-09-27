"""Conversão de prova enviada pelo aluno — Fase 5.

O que these tests pinam: a prova só entra no pipeline quando foi revisada e alguém
confirmou os direitos; a questão nasce `PENDING` com crédito do autor e sem
`source_url`; e reconverter o mesmo envio atualiza em vez de duplicar.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.questions.models import Question, QuestionSource, SearchRun
from apps.questions.submissions import convert_submission
from apps.questions.visibility import visible
from apps.workspace.models import ExamSubmission

CONVERT_URL = "/api/backoffice/content/proofs/convert/"

JSON_CONTENT = """
{
  "questions": [
    {
      "source_id": "q1",
      "statement": "Assinale a alternativa correta sobre o regime jurídico dos servidores públicos.",
      "options": ["A alternativa um", "A alternativa dois", "A alternativa três"],
      "correct_answer": 1,
      "banca": "CEBRASPE",
      "year": 2024,
      "discipline": "Direito",
      "number": 1,
      "exam_title": "Prova de Direito",
      "url": "https://exemplo.inicial/prova/1"
    },
    {
      "source_id": "q2",
      "statement": "Assinale a alternativa correta sobre Licitações e Contratos Públicos.",
      "options": ["A alternativa um", "A alternativa dois"],
      "correct_answer": 0,
      "banca": "CEBRASPE",
      "year": 2024,
      "discipline": "Direito",
      "number": 2,
      "exam_title": "Prova de Direito"
    }
  ]
}
"""

XML_CONTENT = """<questions>
  <question id="x1" number="1">
    <statement>Assinale a alternativa correta sobre Direito Administrativo.</statement>
    <options>
      <option letter="A">A alternativa um</option>
      <option letter="B">A alternativa dois</option>
    </options>
    <correct_answer>B</correct_answer>
    <institution>CEBRASPE</institution>
    <year>2024</year>
    <subject>direito_administrativo</subject>
  </question>
</questions>"""


class SubmissionConversionTests(TestCase):
    def setUp(self):
        self.author = get_user_model().objects.create_user(username="carlos", password="x")
        self.staff = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.staff)
        self.submission = ExamSubmission.objects.create(
            user=self.author,
            title="Prova de Direito Preventivo",
            source_url="https://exemplo.inicial/prova",
            rights_confirmed=True,
            status=ExamSubmission.Status.REVIEWED,
        )

    def test_conversion_creates_pending_questions_with_the_author_as_credit(self):
        run_record = convert_submission(
            self.submission, content=JSON_CONTENT, started_by=self.staff
        )

        self.assertEqual(run_record.status, SearchRun.Status.DONE)
        self.assertEqual(run_record.counts["created"], 2)
        question = Question.objects.get(external_id=f"envio{self.submission.pk}:1")
        self.assertEqual(question.status, Question.Status.PENDING)
        self.assertEqual(question.correct_answer, 1)
        self.assertEqual(question.options[1], "A alternativa dois")
        self.assertEqual(question.search_run_id, run_record.id)
        self.assertEqual(question.source.kind, QuestionSource.Kind.LOCAL_FILE)
        self.assertTrue(question.source.requires_attribution)
        self.assertEqual(question.source.attribution, "Enviado por carlos")
        # Nada de link público na questão: o link do envio fica no ExamSubmission.
        self.assertEqual(question.source_url, "")
        self.assertEqual(visible().count(), 0)

    def test_conversion_records_the_run_on_the_submission(self):
        run_record = convert_submission(
            self.submission, content=JSON_CONTENT, started_by=self.staff
        )

        self.submission.refresh_from_db()
        self.assertEqual(self.submission.converted_run_id, run_record.id)
        self.assertEqual(self.submission.converted_questions, 2)
        self.assertIsNotNone(self.submission.converted_at)
        self.assertIsNotNone(self.submission.source_id)
        self.assertIn("carlos", run_record.name)
        self.assertEqual(run_record.started_by_id, self.staff.id)

    def test_reconverting_the_same_submission_updates_instead_of_duplicating(self):
        convert_submission(self.submission, content=JSON_CONTENT, started_by=self.staff)
        changed = JSON_CONTENT.replace("Assinale a alternativa correta sobre Licitações", "Reescrito: Licitações")
        run_record = convert_submission(
            self.submission, content=changed, started_by=self.staff
        )

        self.assertEqual(Question.objects.count(), 2)
        self.assertEqual(run_record.counts.get("created", 0), 0)
        self.assertTrue(Question.objects.filter(external_id=f"envio{self.submission.pk}:2", statement__startswith="Reescrito").exists())

    def test_a_second_submission_of_the_same_question_is_a_duplicate(self):
        convert_submission(self.submission, content=JSON_CONTENT, started_by=self.staff)
        other = ExamSubmission.objects.create(
            user=self.author, title="A mesma prova de novo", rights_confirmed=True,
            status=ExamSubmission.Status.REVIEWED,
        )

        run_record = convert_submission(other, content=JSON_CONTENT, started_by=self.staff)

        self.assertEqual(run_record.counts.get("created", 0), 0)
        self.assertEqual(Question.objects.count(), 2)

    def test_xml_pasted_in_the_form_is_accepted(self):
        run_record = convert_submission(
            self.submission, content=XML_CONTENT, started_by=self.staff
        )

        self.assertEqual(run_record.counts["created"], 1)
        question = Question.objects.get(external_id=f"envio{self.submission.pk}:1")
        self.assertEqual(question.correct_answer, 1)
        self.assertEqual(question.discipline, "Direito Administrativo")

    def test_submission_without_rights_is_refused(self):
        self.submission.rights_confirmed = False
        self.submission.save(update_fields=["rights_confirmed"])

        with self.assertRaises(ValidationError) as ctx:
            convert_submission(self.submission, content=JSON_CONTENT, started_by=self.staff)

        self.assertIn("rights_confirmed", ctx.exception.message_dict)
        self.assertEqual(SearchRun.objects.count(), 0)

    def test_unreviewed_submission_is_refused(self):
        self.submission.status = ExamSubmission.Status.PENDING
        self.submission.save(update_fields=["status"])

        with self.assertRaises(ValidationError) as ctx:
            convert_submission(self.submission, content=JSON_CONTENT, started_by=self.staff)

        self.assertIn("status", ctx.exception.message_dict)
        self.assertEqual(Question.objects.count(), 0)

    def test_empty_or_broken_content_is_refused_before_the_run_exists(self):
        with self.assertRaises(ValidationError):
            convert_submission(self.submission, content="   ", started_by=self.staff)
        with self.assertRaises(ValidationError) as ctx:
            convert_submission(self.submission, content="<questions><question>", started_by=self.staff)
        self.assertIn("content", ctx.exception.message_dict)
        self.assertEqual(SearchRun.objects.count(), 0)

    def test_dry_run_creates_nothing_and_keeps_the_submission_untouched(self):
        run_record = convert_submission(
            self.submission, content=JSON_CONTENT, started_by=self.staff, dry_run=True
        )

        self.assertEqual(run_record.counts["created"], 2)
        self.assertEqual(Question.objects.count(), 0)
        self.submission.refresh_from_db()
        self.assertIsNone(self.submission.converted_run_id)

    def test_xml_without_institution_falls_back_to_the_submission_title(self):
        # O XML aceita `<institution>` vazio; sem banca a questão perderia o filtro
        # por banca, que é como o aluno encontra a questão no dia seguinte.
        content = XML_CONTENT.replace("    <institution>CEBRASPE</institution>\n", "")

        convert_submission(self.submission, content=content, started_by=self.staff)

        self.assertEqual(
            Question.objects.get(external_id=f"envio{self.submission.pk}:1").banca,
            "Prova de Direito Preventivo",
        )


class ProofConvertApiTests(TestCase):
    def setUp(self):
        self.author = get_user_model().objects.create_user(username="dora", password="x")
        self.staff = get_user_model().objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.outsider = get_user_model().objects.create_user(username="aluno", password="x")
        self.submission = ExamSubmission.objects.create(
            user=self.author, title="Prova de Direito", rights_confirmed=True,
            status=ExamSubmission.Status.REVIEWED,
        )

    def test_staff_converts_through_the_api_and_gets_the_run_back(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.staff)

        response = self.client_api.post(
            CONVERT_URL, {"id": self.submission.id, "content": JSON_CONTENT}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["counts"]["created"], 2)
        self.assertEqual(response.data["submission"]["username"], "dora")
        self.assertEqual(Question.objects.count(), 2)

    def test_uploaded_file_is_converted_too(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client_api = APIClient()
        self.client_api.force_authenticate(self.staff)
        upload = SimpleUploadedFile("prova.json", JSON_CONTENT.encode("utf-8"), content_type="application/json")

        response = self.client_api.post(CONVERT_URL, {"id": self.submission.id, "file": upload})

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Question.objects.count(), 2)

    def test_admin_can_confirm_rights_of_an_old_submission_while_converting(self):
        old = ExamSubmission.objects.create(
            user=self.author, title="Prova antiga", rights_confirmed=False,
            status=ExamSubmission.Status.REVIEWED,
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.staff)

        refused = self.client_api.post(
            CONVERT_URL, {"id": old.id, "content": JSON_CONTENT}, format="json"
        )
        confirmed = self.client_api.post(
            CONVERT_URL,
            {"id": old.id, "content": JSON_CONTENT, "rights_confirmed": "true"},
            format="json",
        )

        self.assertEqual(refused.status_code, 400)
        self.assertIn("rights_confirmed", refused.data)
        self.assertEqual(confirmed.status_code, 201)
        old.refresh_from_db()
        self.assertTrue(old.rights_confirmed)

    def test_missing_submission_is_404_and_non_staff_is_403(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.staff)
        self.assertEqual(
            self.client_api.post(CONVERT_URL, {"id": 9999, "content": JSON_CONTENT}, format="json").status_code,
            404,
        )
        self.client_api.force_authenticate(self.outsider)
        self.assertEqual(
            self.client_api.post(CONVERT_URL, {"id": self.submission.id, "content": JSON_CONTENT}, format="json").status_code,
            403,
        )

    def test_proof_list_carries_what_the_conversion_needs(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.staff)

        response = self.client_api.get("/api/backoffice/content/proofs/")

        row = response.data["results"][0]
        self.assertEqual(row["rights_confirmed"], True)
        self.assertIn("description", row)
        self.assertIn("file_url", row)
        self.assertEqual(row["converted_questions"], 0)
