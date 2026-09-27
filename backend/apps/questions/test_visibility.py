"""Testes de regressão de visibilidade — Fase 0.7.

Garante que questões PENDING e REJECTED são invisíveis em TODOS os endpoints do
aluno, e que o invariante `is_active = (status == APPROVED)` nunca é quebrado.
Estes testes fazem parte do CI e devem permanecer verdes a cada PR.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.questions import moderation
from apps.questions.models import Exam, Question
from apps.chat.services import build_study_context
from apps.workspace.models import Notebook

User = get_user_model()

LONG_EXPLANATION = (
    "O gabarito correto é a alternativa B porque o art. 37 da Constituição Federal "
    "estabelece os princípios da administração pública, e o princípio da legalidade "
    "exige que o agente público atue conforme a lei, sem margem para discricionariedade "
    "além do que a norma permite."
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_question(status=Question.Status.PENDING, is_active=False, **kwargs):
    defaults = dict(
        discipline="Direito Constitucional",
        banca="CEBRASPE",
        year=2024,
        statement="Assinale a alternativa correta sobre o art. 37 da CF.",
        options=["A", "B", "C", "D"],
        correct_answer=1,
    )
    defaults.update(kwargs)
    return Question.objects.create(status=status, is_active=is_active, **defaults)


def _approved(**kwargs):
    q = _make_question(
        status=Question.Status.APPROVED,
        is_active=True,
        explanation=LONG_EXPLANATION,
        **kwargs,
    )
    return q


def _pending(**kwargs):
    return _make_question(status=Question.Status.PENDING, is_active=False, **kwargs)


def _rejected(**kwargs):
    q = _make_question(status=Question.Status.REJECTED, is_active=False, **kwargs)
    q.rejection_reason = "Gabarito errado na fonte."
    q.rejection_reason_code = "gabarito_errado"
    q.save(update_fields=["rejection_reason", "rejection_reason_code"])
    return q


# ---------------------------------------------------------------------------
# 1. Invariante do modelo
# ---------------------------------------------------------------------------

class DefaultIsActiveTests(TestCase):
    """Question.objects.create() sem is_active explícito nasce is_active=False."""

    def test_new_question_default_is_active_false(self):
        q = Question.objects.create(
            discipline="Matemática", banca="FGV", year=2024,
            statement="Enunciado", options=["A", "B"], correct_answer=0,
        )
        self.assertFalse(q.is_active)
        self.assertEqual(q.status, Question.Status.PENDING)

    def test_sync_visibility_follows_status(self):
        q = _pending()
        for status_val, expected in (
            (Question.Status.APPROVED, True),
            (Question.Status.PENDING, False),
            (Question.Status.REJECTED, False),
        ):
            with self.subTest(status=status_val):
                q.status = status_val
                moderation.sync_visibility(q)
                self.assertEqual(Question.objects.get(pk=q.pk).is_active, expected)

    def test_approve_sets_is_active_true(self):
        reviewer = User.objects.create_user("rev", password="x")
        q = _pending()
        moderation.approve(q, reviewer, LONG_EXPLANATION)
        q.refresh_from_db()
        self.assertTrue(q.is_active)
        self.assertEqual(q.status, Question.Status.APPROVED)

    def test_reject_sets_is_active_false(self):
        reviewer = User.objects.create_user("rev2", password="x")
        q = _approved()
        moderation.reject(q, reviewer, "Gabarito errado", "gabarito_errado")
        q.refresh_from_db()
        self.assertFalse(q.is_active)
        self.assertEqual(q.status, Question.Status.REJECTED)

    def test_reopen_sets_is_active_false(self):
        reviewer = User.objects.create_user("rev3", password="x")
        q = _approved()
        moderation.reopen(q, reviewer, "Conteúdo mudou na fonte.")
        q.refresh_from_db()
        self.assertFalse(q.is_active)
        self.assertEqual(q.status, Question.Status.PENDING)


# ---------------------------------------------------------------------------
# 2. Endpoints do aluno — lista, filtros e facets
# ---------------------------------------------------------------------------

class QuestionListVisibilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("aluno", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.approved = _approved(discipline="Português", banca="CEBRASPE", year=2025)
        self.pending = _pending(discipline="Matemática", banca="FGV", year=2024)
        self.rejected = _rejected(discipline="Direito Penal", banca="FGV", year=2023)

    def test_list_only_returns_approved(self):
        resp = self.client.get("/api/questions/")
        ids = [q["id"] for q in resp.data["results"]]
        self.assertIn(self.approved.id, ids)
        self.assertNotIn(self.pending.id, ids)
        self.assertNotIn(self.rejected.id, ids)

    def test_disciplines_only_lists_approved(self):
        resp = self.client.get("/api/questions/disciplines/")
        self.assertIn("Português", resp.data)
        self.assertNotIn("Matemática", resp.data)
        self.assertNotIn("Direito Penal", resp.data)

    def test_facets_only_include_approved(self):
        resp = self.client.get("/api/questions/facets/")
        self.assertIn("Português", resp.data["disciplines"])
        self.assertNotIn("Matemática", resp.data["disciplines"])
        self.assertNotIn("Direito Penal", resp.data["disciplines"])
        self.assertIn("CEBRASPE", resp.data["bancas"])
        self.assertNotIn("FGV", resp.data["bancas"])

    def test_pending_question_returns_404_on_direct_access(self):
        resp = self.client.get(f"/api/questions/{self.pending.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_rejected_question_returns_404_on_direct_access(self):
        resp = self.client.get(f"/api/questions/{self.rejected.id}/")
        self.assertEqual(resp.status_code, 404)


# ---------------------------------------------------------------------------
# 3. Endpoints do aluno — answer, review, note, favorite, comment, report
# ---------------------------------------------------------------------------

class QuestionActionVisibilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("aluno2", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.pending = _pending()
        self.rejected = _rejected()

    def _assert_404(self, path, method="post", data=None):
        fn = getattr(self.client, method)
        resp = fn(path, data or {}, format="json")
        self.assertEqual(resp.status_code, 404, msg=f"{method.upper()} {path} returned {resp.status_code}")

    def test_cannot_answer_pending_question(self):
        self._assert_404(f"/api/questions/{self.pending.id}/answer/", data={"selected_answer": 0})

    def test_cannot_answer_rejected_question(self):
        self._assert_404(f"/api/questions/{self.rejected.id}/answer/", data={"selected_answer": 0})

    def test_cannot_review_pending_question(self):
        self._assert_404(f"/api/questions/{self.pending.id}/review/")

    def test_cannot_favorite_pending_question(self):
        self._assert_404(f"/api/questions/{self.pending.id}/favorite/")

    def test_cannot_note_pending_question(self):
        resp = self.client.put(
            f"/api/questions/{self.pending.id}/note/",
            {"content": "anotação"}, format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_cannot_comment_on_pending_question(self):
        self._assert_404(f"/api/questions/{self.pending.id}/comments/", data={"content": "comentário"})

    def test_cannot_report_pending_question(self):
        self._assert_404(
            f"/api/questions/{self.pending.id}/report/",
            data={"description": "Enunciado com informação incorreta."},
        )


# ---------------------------------------------------------------------------
# 4. Exam — question_count e lista de questões
# ---------------------------------------------------------------------------

class ExamVisibilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("aluno3", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.exam = Exam.objects.create(title="Prova X", banca="FGV", year=2025)
        self.approved = _approved(exam=self.exam, discipline="Português", banca="FGV", year=2025)
        self.pending = _pending(exam=self.exam, discipline="Matemática", banca="FGV", year=2025)
        self.rejected = _rejected(exam=self.exam, discipline="Direito Penal", banca="FGV", year=2025)

    def test_exam_question_count_only_counts_approved(self):
        resp = self.client.get("/api/exams/")
        exam_data = next(e for e in resp.data if e["id"] == self.exam.id)
        self.assertEqual(exam_data["question_count"], 1)

    def test_exam_disciplines_only_lists_approved(self):
        resp = self.client.get("/api/exams/")
        exam_data = next(e for e in resp.data if e["id"] == self.exam.id)
        self.assertIn("Português", exam_data["disciplines"])
        self.assertNotIn("Matemática", exam_data["disciplines"])
        self.assertNotIn("Direito Penal", exam_data["disciplines"])

    def test_exam_questions_endpoint_only_returns_approved(self):
        resp = self.client.get(f"/api/exams/{self.exam.id}/questions/")
        ids = [q["id"] for q in resp.data]
        self.assertIn(self.approved.id, ids)
        self.assertNotIn(self.pending.id, ids)
        self.assertNotIn(self.rejected.id, ids)


# ---------------------------------------------------------------------------
# 5. Simulado — start e submit
# ---------------------------------------------------------------------------

class SimulationVisibilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("aluno4", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.exam = Exam.objects.create(title="Simulado Y", banca="CEBRASPE", year=2025)
        # 3 aprovadas, 1 pending, 1 rejected — o simulado só pode ver as 3
        self.approved = [
            _approved(
                exam=self.exam, discipline="Português", banca="CEBRASPE", year=2025,
                statement=f"Questão aprovada {i}", options=["A", "B"], correct_answer=0,
            )
            for i in range(3)
        ]
        self.pending = _pending(exam=self.exam, discipline="Português", banca="CEBRASPE", year=2025)
        self.rejected = _rejected(exam=self.exam, discipline="Português", banca="CEBRASPE", year=2025)

    def test_start_simulation_only_picks_approved_questions(self):
        resp = self.client.post("/api/questions/simulations/start/", {
            "exam_ids": [self.exam.id],
            "discipline": "Português",
            "banca": "CEBRASPE",
            "year": 2025,
            "count": 3,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        picked_ids = {q["id"] for q in resp.data["questions"]}
        approved_ids = {q.id for q in self.approved}
        self.assertTrue(picked_ids.issubset(approved_ids))
        self.assertNotIn(self.pending.id, picked_ids)
        self.assertNotIn(self.rejected.id, picked_ids)

    def test_start_simulation_pool_count_excludes_pending_and_rejected(self):
        # Pedir mais questões do que as 3 aprovadas deve retornar 400 com "Apenas 3"
        resp = self.client.post("/api/questions/simulations/start/", {
            "exam_ids": [self.exam.id],
            "count": 4,
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Apenas 3", resp.data["detail"])

    def test_submit_simulation_rejects_pending_question_id(self):
        resp = self.client.post("/api/questions/submit-simulation/", {"answers": [
            {"question_id": self.pending.id, "selected_answer": 0},
        ]}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_submit_simulation_rejects_rejected_question_id(self):
        resp = self.client.post("/api/questions/submit-simulation/", {"answers": [
            {"question_id": self.rejected.id, "selected_answer": 0},
        ]}, format="json")
        self.assertEqual(resp.status_code, 400)


# ---------------------------------------------------------------------------
# 6. Chat — contexto de questões
# ---------------------------------------------------------------------------

class ChatContextVisibilityTests(TestCase):
    def test_build_study_context_ignores_inactive_questions(self):
        approved = _approved(statement="Questão aprovada para o chat.")
        pending = _pending(statement="Questão pendente que não deve aparecer.")
        rejected = _rejected(statement="Questão rejeitada que não deve aparecer.")

        context = build_study_context(
            question_ids=[approved.id, pending.id, rejected.id]
        )
        # Cada questão aparece no contexto como "Questão {id} (..."
        self.assertIn(f"Questão {approved.id} (", context)
        self.assertNotIn(f"Questão {pending.id} (", context)
        self.assertNotIn(f"Questão {rejected.id} (", context)
        # Textos distintivos também não devem aparecer
        self.assertNotIn("pendente que não deve aparecer", context)
        self.assertNotIn("rejeitada que não deve aparecer", context)

    def test_build_study_context_with_only_inactive_returns_empty(self):
        pending = _pending()
        context = build_study_context(question_ids=[pending.id])
        self.assertEqual(context, "")


# ---------------------------------------------------------------------------
# 7. Notebook (workspace) — só aprova questão ativa
# ---------------------------------------------------------------------------

class NotebookVisibilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("aluno5", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_cannot_add_pending_question_to_notebook(self):
        pending = _pending()
        resp = self.client.post("/api/workspace/notebooks/", {"title": "Caderno"})
        nb_id = resp.data["id"]
        resp = self.client.post(
            f"/api/workspace/notebooks/{nb_id}/questions/",
            {"question_id": pending.id},
        )
        self.assertEqual(resp.status_code, 400)

    def test_cannot_add_rejected_question_to_notebook(self):
        rejected = _rejected()
        resp = self.client.post("/api/workspace/notebooks/", {"title": "Caderno 2"})
        nb_id = resp.data["id"]
        resp = self.client.post(
            f"/api/workspace/notebooks/{nb_id}/questions/",
            {"question_id": rejected.id},
        )
        self.assertEqual(resp.status_code, 400)


# ---------------------------------------------------------------------------
# 8. Backoffice — PATCH direto de is_active recusado
# ---------------------------------------------------------------------------

class BackofficePatchVisibilityTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin", password="x", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.pending = _pending()

    def test_patch_is_active_directly_is_refused(self):
        """Setar is_active direto via PATCH deve ser recusado — use action=approve."""
        resp = self.client.patch("/api/backoffice/content/questions/", {
            "id": self.pending.id,
            "is_active": True,
        }, format="json")
        # Sem action válida e sem explanation, a view retorna 400
        self.assertEqual(resp.status_code, 400)
        # O campo is_active NÃO foi alterado no banco
        self.assertFalse(Question.objects.get(pk=self.pending.id).is_active)

    def test_approve_via_backoffice_uses_moderation(self):
        resp = self.client.patch("/api/backoffice/content/questions/", {
            "id": self.pending.id,
            "action": "approve",
            "explanation": LONG_EXPLANATION,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        q = Question.objects.get(pk=self.pending.id)
        self.assertTrue(q.is_active)
        self.assertEqual(q.status, Question.Status.APPROVED)
        self.assertEqual(q.reviewed_by, self.admin)

    def test_reject_via_backoffice_uses_moderation(self):
        resp = self.client.patch("/api/backoffice/content/questions/", {
            "id": self.pending.id,
            "action": "reject",
            "rejection_reason": "O gabarito está incorreto conforme o edital.",
            "rejection_reason_code": "gabarito_errado",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        q = Question.objects.get(pk=self.pending.id)
        self.assertFalse(q.is_active)
        self.assertEqual(q.status, Question.Status.REJECTED)

    def test_approve_with_short_explanation_returns_400(self):
        resp = self.client.patch("/api/backoffice/content/questions/", {
            "id": self.pending.id,
            "action": "approve",
            "explanation": "Curto demais.",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        # Status não muda
        self.assertEqual(Question.objects.get(pk=self.pending.id).status, Question.Status.PENDING)

    def test_backoffice_get_defaults_to_pending_queue(self):
        approved = _approved(discipline="Português", statement="Aprovada visível.")
        resp = self.client.get("/api/backoffice/content/questions/")
        ids = [q["id"] for q in resp.data["results"]]
        self.assertIn(self.pending.id, ids)
        self.assertNotIn(approved.id, ids)

    def test_backoffice_get_status_filter_works(self):
        approved = _approved(discipline="Português", statement="Aprovada para filtro.")
        resp = self.client.get("/api/backoffice/content/questions/?status=approved")
        ids = [q["id"] for q in resp.data["results"]]
        self.assertIn(approved.id, ids)
        self.assertNotIn(self.pending.id, ids)

    def test_backoffice_get_returns_full_statement_and_options(self):
        resp = self.client.get("/api/backoffice/content/questions/")
        result = next(q for q in resp.data["results"] if q["id"] == self.pending.id)
        # Enunciado completo, não truncado
        self.assertEqual(result["statement"], self.pending.statement)
        # Opções presentes
        self.assertIn("options", result)
        self.assertIn("correct_answer", result)
