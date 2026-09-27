"""Fase 2 — o Django admin como fila de aprovação em lote.

Cobre o que o admin promete: a ordem em que a fila aparece e as quatro ações em
massa. Todas passam por `moderation.py`, então nenhum teste pode contornar a regra
do gabarito comentado.
"""

from django.contrib import admin as django_admin
from django.contrib.admin.sites import site as default_admin_site
from django.contrib.auth import get_user_model
from django.contrib.messages.storage.base import BaseStorage
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase, override_settings
from django.urls import reverse

from apps.questions import admin as questions_admin
from apps.questions.admin import QuestionAdmin, QuestionSourceAdmin
from apps.questions.models import (
    Question,
    QuestionSource,
    SearchRun,
    UserAnswer,
)
from apps.questions.visibility import visible

EXPLANATION = (
    "Comentário curado com tamanho suficiente para passar na regra da fila de "
    "aprovação, que exige no mínimo 120 caracteres antes de publicar a questão."
)


class _CollectedMessages(BaseStorage):
    """Storage mínimo: as ações em massa só precisam registrar o aviso."""

    def __init__(self, request):
        super().__init__(request)
        self.queued = []

    def add(self, level, message, extra_tags=""):
        self.queued.append((level, message))

    def _get(self, *args, **kwargs):
        return [], True


def admin_request(user, path="/admin/questions/question/"):
    request = RequestFactory().get(path)
    request.user = user
    request._messages = _CollectedMessages(request)
    return request


class QuestionQueueAdminTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="curador", password="safe-password", email="curador@example.test"
        )
        self.client.force_login(self.user)
        self.factory = RequestFactory()
        self.model_admin = QuestionAdmin(Question, django_admin.site)
        self.source = QuestionSource.objects.create(
            slug="fila", name="Fonte da fila", kind="open_dataset",
            license_name="Licença de teste", is_active=True,
        )

    def request(self, path="/admin/questions/question/"):
        return admin_request(self.user, path)

    def make_question(self, **kwargs):
        defaults = {
            "source": self.source,
            "discipline": "Direito Administrativo",
            "banca": "CEBRASPE",
            "year": 2024,
            "statement": "Enunciado de fila para ordenação e ações em massa.",
            "options": ["Alternativa A", "Alternativa B"],
            "correct_answer": 0,
        }
        return Question.objects.create(**{**defaults, **kwargs})

    def queued_ids(self):
        """`get_queryset` já aplica `get_ordering`; a ordem é a da fila."""
        return list(
            self.model_admin.get_queryset(self.request()).values_list("id", flat=True)
        )

    def test_default_order_puts_pending_first(self):
        approved = self.make_question(status=Question.Status.APPROVED)
        rejected = self.make_question(status=Question.Status.REJECTED)
        pending = self.make_question(status=Question.Status.PENDING)

        self.assertEqual(
            self.model_admin.get_ordering(self.request()),
            ["status_order", "-comment_requests_count", "-error_count", "id"],
        )
        ids = self.queued_ids()
        self.assertEqual(ids[0], pending.id)
        self.assertLess(ids.index(rejected.id), ids.index(approved.id))

    def test_pending_sorts_before_rejected_and_approved_regardless_of_errors(self):
        approved = self.make_question(status=Question.Status.APPROVED)
        rejected = self.make_question(status=Question.Status.REJECTED)
        pending = self.make_question(status=Question.Status.PENDING)
        for question in (approved, rejected, pending):
            UserAnswer.objects.create(
                question=question, user=self.user, selected_answer=1, is_correct=False
            )

        ids = self.queued_ids()

        self.assertEqual(ids.index(pending.id), 0)
        self.assertLess(ids.index(rejected.id), ids.index(approved.id))

    def test_within_the_queue_the_most_complained_comes_first(self):
        quiet = self.make_question()
        complained = self.make_question()
        UserAnswer.objects.create(
            question=complained, user=self.user, selected_answer=1, is_correct=False
        )

        ids = self.queued_ids()

        self.assertEqual(ids.index(complained.id), 0)
        self.assertLess(ids.index(complained.id), ids.index(quiet.id))

    def test_bulk_actions_are_registered(self):
        labels = [action.short_description for action in self.model_admin.actions]
        self.assertEqual(len(labels), 4)
        self.assertTrue(any("Aprovar" in label for label in labels))
        self.assertTrue(any("duplicada" in label for label in labels))

    def test_mark_duplicate_rejects_with_structured_reason(self):
        question = self.make_question()

        questions_admin._mark_duplicate_selected(
            self.model_admin, self.request(), Question.objects.filter(pk=question.pk)
        )

        question.refresh_from_db()
        self.assertEqual(question.status, Question.Status.REJECTED)
        self.assertEqual(question.rejection_reason_code, "duplicada")
        self.assertFalse(visible().filter(pk=question.pk).exists())
        self.assertEqual(question.reviewed_by, self.user)

    def test_approve_action_skips_questions_without_enough_explanation(self):
        without = self.make_question(explanation="curta")
        with_text = self.make_question(explanation=EXPLANATION)

        questions_admin._approve_selected(
            self.model_admin,
            self.request(),
            Question.objects.filter(pk__in=[without.pk, with_text.pk]),
        )

        without.refresh_from_db()
        with_text.refresh_from_db()
        self.assertEqual(without.status, Question.Status.PENDING)
        self.assertFalse(visible().filter(pk=without.pk).exists())
        self.assertEqual(with_text.status, Question.Status.APPROVED)
        self.assertTrue(visible().filter(pk=with_text.pk).exists())

    def test_reopen_action_returns_the_question_to_the_queue(self):
        question = self.make_question(status=Question.Status.APPROVED)

        questions_admin._reopen_selected(
            self.model_admin, self.request(), Question.objects.filter(pk=question.pk)
        )

        question.refresh_from_db()
        self.assertEqual(question.status, Question.Status.PENDING)
        self.assertFalse(visible().filter(pk=question.pk).exists())

    def test_source_cannot_be_activated_without_license(self):
        source = QuestionSource.objects.create(
            slug="sem-licenca", name="Sem licença", kind="open_dataset", is_active=True
        )
        model_admin = django_admin.site._registry[QuestionSource]

        with self.assertRaises(ValidationError):
            model_admin.save_model(self.request(), source, None, False)


@override_settings(
    QUESTIONS_SOURCES={"referencia": {"path": "apps/questions/data/reference_dataset.json"}}
)
class QuestionSourceSearchAdminTests(TestCase):
    """A página de busca por fonte e o histórico de execuções da Fase 2."""

    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="busca", password="safe-password", email="busca@example.test"
        )
        self.client.force_login(self.user)
        self.source = QuestionSource.objects.create(
            slug="fila", name="Fonte da fila", kind="local_file",
            license_name="Licença de teste", is_active=True,
        )
        self.dataset_source = QuestionSource.objects.create(
            slug="referencia", name="Dataset de referência", kind="open_dataset",
            license_name="CC0 1.0", is_active=True,
        )
        self.run = SearchRun.objects.create(
            source=self.source,
            filters={},
            next_page=2,
            counts={"duplicates_skipped": 1},
            duplicates_preview=[{"external_id": "x", "match_id": 1, "score": 90}],
        )

    def test_search_and_history_pages_are_reachable(self):
        self.assertEqual(
            reverse("admin:questions_questionsource_search"),
            "/admin/questions/questionsource/search/",
        )
        for name in ("admin:questions_questionsource_search", "admin:questions_searchrun_history"):
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(name)).status_code, 200)

    def test_history_page_links_to_continue_rerun_and_import_skipped(self):
        page = self.client.get(reverse("admin:questions_searchrun_history"))

        self.assertContains(page, reverse("admin:questions_searchrun_continue", args=[self.run.pk]))
        self.assertContains(page, reverse("admin:questions_searchrun_rerun", args=[self.run.pk]))
        self.assertContains(
            page, reverse("admin:questions_searchrun_import_skipped", args=[self.run.pk])
        )

    def test_continue_without_a_next_page_is_refused(self):
        self.run.next_page = None
        self.run.save(update_fields=["next_page"])

        response = self.client.get(
            reverse("admin:questions_searchrun_continue", args=[self.run.pk]), follow=True
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "não possui próxima página")

    def test_search_page_executes_a_run_for_the_chosen_source(self):
        runs_before = SearchRun.objects.count()

        response = self.client.post(
            reverse("admin:questions_questionsource_search"),
            {
                "action": "search",
                "source": self.dataset_source.slug,
                "limit": "5",
                "dry_run": "on",
            },
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(SearchRun.objects.count(), runs_before + 1)
        self.assertEqual(Question.objects.count(), 0)  # simulação não grava

    def test_search_page_reports_a_source_without_the_required_filter(self):
        response = self.client.post(
            reverse("admin:questions_questionsource_search"),
            {"action": "search", "source": self.source.slug, "limit": "5"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Arquivo é obrigatório.")

    def test_source_cannot_be_activated_without_a_license(self):
        source = QuestionSource.objects.create(
            slug="sem-licenca", name="Fonte sem licença", kind="local_file"
        )
        source.is_active = True
        model_admin = QuestionSourceAdmin(QuestionSource, default_admin_site)

        with self.assertRaises(ValidationError):
            model_admin.save_model(admin_request(self.user), source, None, change=False)

        source.refresh_from_db()
        self.assertFalse(source.is_active)

    def test_source_with_a_license_can_be_activated(self):
        source = QuestionSource.objects.create(
            slug="com-licenca", name="Fonte com licença", kind="local_file",
            license_name="CC0 1.0",
        )
        source.is_active = True
        model_admin = QuestionSourceAdmin(QuestionSource, default_admin_site)

        model_admin.save_model(admin_request(self.user), source, None, change=False)

        source.refresh_from_db()
        self.assertTrue(source.is_active)
