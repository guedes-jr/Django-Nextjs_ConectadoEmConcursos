from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.questions import moderation
from apps.questions.models import Question
from apps.questions.visibility import visible

User = get_user_model()

LONG_EXPLANATION = (
    "O gabarito está errado porque a alínea trata da situations de emergência prevista em lei, "
    "e não do regime ordinário, como mostra o texto legal."
)


class ModerationBase(TestCase):
    def setUp(self):
        self.reviewer = User.objects.create_user(username="revisor", password="x")
        self.question = Question.objects.create(
            discipline="Direito Constitucional",
            banca="CEBRASPE",
            year=2024,
            statement="Assinale a alternativa correta.",
            options=["a", "b"],
            correct_answer=0,
        )

    def reload(self):
        return Question.objects.get(pk=self.question.pk)


class ApproveTests(ModerationBase):
    def test_short_explanation_is_refused_and_nothing_changes(self):
        with self.assertRaises(ValidationError):
            moderation.approve(self.question, self.reviewer, "Curto demais.")
        self.question = self.reload()
        self.assertEqual(self.question.status, Question.Status.PENDING)
        self.assertIsNone(self.question.reviewed_at)
        self.assertEqual(self.question.explanation, "")

    def test_blank_explanation_is_refused(self):
        for value in (None, "", "   "):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                moderation.approve(self.question, self.reviewer, value)

    def test_exactly_minimum_is_accepted(self):
        text = "a" * moderation.MIN_EXPLANATION_CHARS
        moderation.approve(self.question, self.reviewer, text)
        self.question = self.reload()
        self.assertEqual(self.question.status, Question.Status.APPROVED)
        self.assertEqual(self.question.explanation, text)
        self.assertEqual(self.question.reviewed_by, self.reviewer)
        self.assertIsNotNone(self.question.reviewed_at)

    def test_explanation_is_stripped_before_saving(self):
        moderation.approve(self.question, self.reviewer, f"  {LONG_EXPLANATION}\n ")
        self.assertEqual(self.reload().explanation, LONG_EXPLANATION)

    def test_without_explanation_argument_uses_the_current_one(self):
        self.question.explanation = LONG_EXPLANATION
        self.question.save(update_fields=["explanation"])
        moderation.approve(self.question, self.reviewer)
        self.assertEqual(self.reload().status, Question.Status.APPROVED)

    def test_current_explanation_still_has_to_reach_the_minimum(self):
        self.question.explanation = "curta"
        self.question.save(update_fields=["explanation"])
        with self.assertRaises(ValidationError):
            moderation.approve(self.question, self.reviewer)
        self.assertEqual(self.reload().status, Question.Status.PENDING)

    def test_approve_clears_a_previous_rejection(self):
        moderation.reject(self.question, self.reviewer, "Gabarito invertido", "gabarito_errado")
        moderation.approve(self.question, self.reviewer, LONG_EXPLANATION)
        self.question = self.reload()
        self.assertEqual(self.question.status, Question.Status.APPROVED)
        self.assertEqual(self.question.rejection_reason, "")
        self.assertEqual(self.question.rejection_reason_code, "")
        self.assertIn(self.question.pk, set(visible().values_list("id", flat=True)))


class RejectTests(ModerationBase):
    def test_reason_is_required(self):
        cases = [("", "gabarito_errado"), ("   ", "gabarito_errado"), ("motivo", ""), ("motivo", None)]
        for reason, code in cases:
            with self.subTest(reason=reason, code=code), self.assertRaises(ValidationError):
                moderation.reject(self.question, self.reviewer, reason, code)
        self.assertEqual(self.reload().status, Question.Status.PENDING)

    def test_unknown_reason_code_is_refused(self):
        with self.assertRaises(ValidationError):
            moderation.reject(self.question, self.reviewer, "porque sim", "porque_sim")

    def test_every_declared_reason_code_is_accepted(self):
        for code in moderation.REJECTION_REASONS:
            with self.subTest(code=code):
                question = Question.objects.get(pk=self.question.pk)
                moderation.reject(question, self.reviewer, f"motivo para {code}", code)
        question = self.reload()
        self.assertEqual(question.status, Question.Status.REJECTED)
        self.assertEqual(question.rejection_reason_code, "fora_do_escopo")

    def test_reject_takes_an_approved_question_off_the_air(self):
        moderation.approve(self.question, self.reviewer, LONG_EXPLANATION)
        moderation.reject(self.question, self.reviewer, "enunciado com erro", "enunciado_com_erro")
        self.question = self.reload()
        self.assertEqual(self.question.status, Question.Status.REJECTED)
        self.assertEqual(self.question.reviewed_by, self.reviewer)


class ReopenTests(ModerationBase):
    def test_reopen_returns_question_to_the_queue(self):
        moderation.reject(self.question, self.reviewer, "Gabarito invertido", "gabarito_errado")
        moderation.reopen(self.question, self.reviewer, "O gabarito mudou na fonte.")
        self.question = self.reload()
        self.assertEqual(self.question.status, Question.Status.PENDING)
        self.assertEqual(self.question.review_note, "O gabarito mudou na fonte.")
        self.assertEqual(self.question.rejection_reason, "")
        self.assertEqual(self.question.rejection_reason_code, "")

    def test_reopen_without_note_is_allowed(self):
        moderation.approve(self.question, self.reviewer, LONG_EXPLANATION)
        moderation.reopen(self.question, self.reviewer)
        self.question = self.reload()
        self.assertEqual(self.question.status, Question.Status.PENDING)
        self.assertEqual(self.question.review_note, "")
        self.assertEqual(self.question.explanation, LONG_EXPLANATION)


class PublicVisibilityTests(ModerationBase):
    """`status=APPROVED` é o que segura a leitura: pendente e rejeitada somem do aluno."""

    def setUp(self):
        super().setUp()
        self.public = Question.objects.create(
            discipline="Direito Constitucional",
            banca="CEBRASPE",
            year=2024,
            statement="Outra questão.",
            options=["a", "b"],
            correct_answer=0,
            explanation=LONG_EXPLANATION,
        )
        moderation.approve(self.public, self.reviewer)

    def test_approved_questions_are_listed(self):
        self.assertIn(self.public, visible())

    def test_rejecting_hides_it_from_the_student(self):
        moderation.reject(self.public, self.reviewer, "Duplicada", "duplicada")
        self.assertNotIn(Question.objects.get(pk=self.public.pk), visible())

    def test_reopening_hides_it_again(self):
        moderation.reopen(self.public, self.reviewer, "Conferir de novo")
        self.assertNotIn(Question.objects.get(pk=self.public.pk), visible())
