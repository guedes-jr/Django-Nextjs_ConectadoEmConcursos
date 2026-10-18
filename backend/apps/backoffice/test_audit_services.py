from datetime import timedelta
from io import StringIO, BytesIO
import json
from pathlib import Path
import tempfile
import tarfile
from unittest.mock import Mock, patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.concursos.models import NewsArticle
from apps.concursos.tests import FakeAdapter, _concurso, _news
from apps.notifications.delivery import materialize_recipients, publish_due
from apps.notifications.models import AdminNotification
from apps.questions import moderation
from apps.questions.ingest import legacy_source, run_items_record
from apps.questions.ingest.base import QuestionItem, FetchResult
from apps.questions.models import Question
from .audit import audit_context, log, snapshot_diff
from .models import AuditEvent


class ServiceAuditTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username="audit-service-reviewer")

    def question(self):
        return Question.objects.create(statement="Questão de auditoria.", options=["A", "B"], correct_answer=0, year=2026, banca="FGV", discipline="Direito")

    def test_moderation_records_actor_before_after_and_reason_without_http(self):
        question = self.question()
        moderation.approve(question, self.user, "Explicação jurídica detalhada e revisada. " * 5)
        event = AuditEvent.objects.get(action="question.approved")
        self.assertEqual(event.actor_id, self.user.pk)
        self.assertEqual(event.before["status"], "pending")
        self.assertEqual(event.after["status"], "approved")
        moderation.reject(question, self.user, "Revisar gabarito", "gabarito_errado")
        self.assertEqual(AuditEvent.objects.get(action="question.rejected").reason, "Revisar gabarito")
        moderation.reopen(question, self.user, "Nova revisão")
        self.assertEqual(AuditEvent.objects.get(action="question.reopened").after["status"], "pending")

    def test_moderation_is_rolled_back_if_audit_cannot_be_persisted(self):
        question = self.question()
        with patch("apps.questions.moderation.audit_log", side_effect=RuntimeError("audit unavailable")):
            with self.assertRaises(RuntimeError):
                moderation.approve(question, self.user, "Explicação longa revisada. " * 10)
        question.refresh_from_db()
        self.assertEqual(question.status, "pending")
        self.assertFalse(AuditEvent.objects.filter(action="question.approved").exists())

    def test_invalid_moderation_does_not_claim_success(self):
        with self.assertRaises(ValidationError):
            moderation.approve(self.question(), self.user, "Curta")
        self.assertFalse(AuditEvent.objects.exists())

    def test_import_audits_created_updated_invalidated_and_summary(self):
        source = legacy_source()
        values = dict(statement="Enunciado original para testar mudança na fonte.", options=["A", "B"], correct_answer=0,
                      banca="FGV", year=2026, discipline="Direito", external_id="audit-source-1")
        run_items_record(source, [QuestionItem(**values)], name="Teste", started_by=self.user)
        question = Question.objects.get()
        self.assertEqual(AuditEvent.objects.get(action="question.import_created").actor_id, self.user.pk)
        moderation.approve(question, self.user, "Explicação revisada da questão. " * 8)
        values["statement"] = "Enunciado alterado pela fonte com novas informações."
        record = run_items_record(source, [QuestionItem(**values)], name="Alteração", started_by=self.user)
        event = AuditEvent.objects.get(action="question.reopened")
        self.assertEqual(event.before["status"], "approved")
        self.assertEqual(event.after["status"], "pending")
        self.assertEqual(event.after["search_run_id"], record.pk)
        summary = AuditEvent.objects.filter(action="question_import.completed").latest("id")
        self.assertEqual(summary.after["counts"]["invalidations"], 1)

    def test_dry_run_records_simulation_without_domain_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"questions.json"
            path.write_text(json.dumps([{"statement":"Questão sintética para auditoria", "options":["A","B"], "correct_answer":0,
                "banca":"FGV", "year":2026, "discipline":"Direito"}]))
            call_command("import_content", str(path), dry_run=True, stdout=StringIO())
        self.assertFalse(Question.objects.exists())
        self.assertFalse(AuditEvent.objects.filter(action="question.import_created").exists())
        summary = AuditEvent.objects.get(action="question_import.completed")
        self.assertTrue(summary.context["dry_run"])
        self.assertEqual(summary.context["origin"], "command:import_content")
        self.assertTrue(AuditEvent.objects.filter(action="command.import_content.completed").exists())

    def test_command_failure_does_not_copy_exception_or_arguments(self):
        with self.assertRaises(CommandError):
            call_command("import_content", "/missing/password=never-store.json", stdout=StringIO())
        event = AuditEvent.objects.get(action="command.import_content.failed")
        self.assertEqual(event.context["error_type"], "CommandError")
        self.assertNotIn("never-store", json.dumps(list(AuditEvent.objects.values()), default=str))
        self.assertFalse(AuditEvent.objects.filter(action="command.import_content.completed").exists())

    def test_partial_and_failed_import_summaries(self):
        source = legacy_source()
        invalid = QuestionItem(statement="", options=["A"], correct_answer=0, banca="FGV", year=2026, discipline="Direito")
        valid = QuestionItem(statement="Questão válida para resumo parcial", options=["A","B"], correct_answer=0, banca="FGV", year=2026, discipline="Direito")
        run_items_record(source, [invalid, valid], name="Parcial")
        self.assertEqual(AuditEvent.objects.get(action="question_import.partial").after["counts"]["errors"], 1)
        run_items_record(source, [invalid], name="Falhou")
        self.assertTrue(AuditEvent.objects.filter(action="question_import.failed").exists())

    def test_sync_questions_command_failure_has_origin(self):
        with self.assertRaises(CommandError):
            call_command("sync_questions", source="missing", stdout=StringIO())
        event = AuditEvent.objects.get(action="command.sync_questions.failed")
        self.assertEqual(event.context["origin"], "command:sync_questions")
        self.assertIsNone(event.actor_id)

    def test_sync_sources_records_system_events_and_summary(self):
        adapter = FakeAdapter(concursos=[_concurso()], news=[_news()])
        with patch("apps.concursos.management.commands.sync_sources.build_adapters", return_value=[adapter]):
            call_command("sync_sources", stdout=StringIO(), stderr=StringIO())
        for action in ("concurso.import_created", "article.import_created", "source_sync.completed"):
            event = AuditEvent.objects.get(action=action)
            self.assertEqual(event.context["origin"], "command:sync_sources")
            self.assertIsNone(event.actor_id)
        self.assertEqual(AuditEvent.objects.get(action="source_sync.completed").after["created"], 2)

    def test_backup_and_restore_commands_use_audited_services(self):
        name = "backup-test.tar.gz"
        with patch("apps.backoffice.services._create_backup", return_value=name), patch("apps.backoffice.management.commands.backup_db.list_backups", return_value=[]):
            call_command("backup_db", stdout=StringIO())
        event = AuditEvent.objects.get(action="backup.created")
        self.assertEqual(event.resource_id, name)
        self.assertEqual(event.context["origin"], "command:backup_db")
        with patch("apps.backoffice.services._restore_backup", return_value={"restored":name, "previous_db_saved_at":"old.sqlite3.bak"}):
            call_command("restore_db", name, stdout=StringIO())
        self.assertEqual(AuditEvent.objects.get(action="backup.restored").context["origin"], "command:restore_db")

    def test_backup_failure_is_not_reported_as_success(self):
        with patch("apps.backoffice.services._create_backup", side_effect=OSError("token=do-not-store")):
            with self.assertRaises(OSError):
                call_command("backup_db", stdout=StringIO())
        self.assertTrue(AuditEvent.objects.filter(action="backup.create.failed").exists())
        self.assertFalse(AuditEvent.objects.filter(action="backup.created").exists())
        self.assertNotIn("do-not-store", json.dumps(list(AuditEvent.objects.values()), default=str))

    def test_scheduled_publication_and_materialization_are_audited_once(self):
        now = timezone.now()
        notice = AdminNotification.objects.create(title="Agenda", scope="all", status="scheduled", starts_at=now-timedelta(minutes=1))
        with patch("django_q.tasks.async_task"):
            with self.captureOnCommitCallbacks(execute=True):
                call_command("publish_scheduled_notifications", stdout=StringIO())
        event = AuditEvent.objects.get(action="notification.published")
        self.assertEqual(event.resource_id, str(notice.pk))
        self.assertIsNone(event.actor_id)
        self.assertEqual(event.context["origin"], "job:publish_due")
        self.assertEqual(publish_due(), 0)
        materialize_recipients(notice.pk)
        materialize_recipients(notice.pk)
        self.assertEqual(AuditEvent.objects.filter(action="notification.recipients_materialized").count(), 1)

    def test_scheduled_article_publication_is_audited_and_idempotent(self):
        article = NewsArticle.objects.create(title="Agendado", slug="audit-scheduled", source="manual", external_id="audit-1",
            editorial_status="scheduled", is_published=False, scheduled_for=timezone.now()-timedelta(minutes=1))
        call_command("publish_scheduled_news", stdout=StringIO())
        call_command("publish_scheduled_news", stdout=StringIO())
        event = AuditEvent.objects.get(action="article.published")
        self.assertEqual(event.before["editorial_status"], "scheduled")
        self.assertEqual(event.resource_id, str(article.pk))
        self.assertEqual(event.context["origin"], "command:publish_scheduled_news")

    def test_context_is_reset_after_nested_operations(self):
        with audit_context(origin="command:test", operation_id="outer"):
            with audit_context(origin="job:test"):
                inside = log(action="test.inside", resource_type="test")
            outside = log(action="test.outside", resource_type="test")
        fresh = log(action="test.fresh", resource_type="test")
        self.assertEqual(inside.context["origin"], "job:test")
        self.assertEqual(outside.context["origin"], "command:test")
        self.assertEqual(fresh.context["origin"], "service")
        self.assertNotIn("operation_id", fresh.context)

    def test_unexpected_pipeline_failure_is_never_marked_completed(self):
        source = legacy_source()
        with patch("apps.questions.ingest.run_items", side_effect=RuntimeError("token=private-error")):
            with self.assertRaises(RuntimeError):
                run_items_record(source, [], name="Falha inesperada")
        event = AuditEvent.objects.get(action="question_import.failed")
        self.assertEqual(event.after["status"], "failed")
        self.assertEqual(event.context["error_type"], "RuntimeError")
        self.assertFalse(AuditEvent.objects.filter(action="question_import.completed").exists())
        self.assertNotIn("private-error", json.dumps(list(AuditEvent.objects.values()), default=str))

    def test_sync_questions_success_has_audited_summary(self):
        source = legacy_source()
        adapter = Mock(label="Sintética")
        adapter.validate_filters.return_value = {}
        adapter.fetch_questions.return_value = FetchResult(items=[QuestionItem(statement="Questão sintética do comando",options=["A","B"],correct_answer=0,banca="FGV",year=2026,discipline="Direito")])
        with patch("apps.questions.ingest.get_adapter", return_value=adapter):
            call_command("sync_questions", source=source.slug, stdout=StringIO())
        event = AuditEvent.objects.get(action="question_import.completed")
        self.assertEqual(event.context["origin"], "command:sync_questions")
        self.assertEqual(event.after["counts"]["created"], 1)

    def test_job_failure_is_recorded_after_transaction_rolls_back(self):
        notice = AdminNotification.objects.create(title="Falha de job",scope="all",status="published")
        with patch("apps.notifications.delivery.NotificationRecipient.objects.bulk_create", side_effect=RuntimeError("secret=private-value")):
            with self.assertRaises(RuntimeError):
                materialize_recipients(notice.pk)
        notice.refresh_from_db()
        self.assertIsNone(notice.recipients_materialized_at)
        self.assertFalse(notice.recipients.exists())
        event = AuditEvent.objects.get(action="job.materialize_recipients.failed")
        self.assertEqual(event.context["error_type"], "RuntimeError")
        self.assertFalse(AuditEvent.objects.filter(action="notification.recipients_materialized").exists())
        self.assertNotIn("private-value", json.dumps(list(AuditEvent.objects.values()), default=str))

    @override_settings(AUDIT_RETENTION_DAYS=365)
    def test_retention_requires_confirmation_and_audits_only_expired_deletion(self):
        expired = AuditEvent.objects.create(action="test.old",resource_type="test")
        recent = AuditEvent.objects.create(action="test.recent",resource_type="test")
        AuditEvent.objects.filter(pk=expired.pk).update(created_at=timezone.now()-timedelta(days=400))
        call_command("purge_audit_events",stdout=StringIO())
        self.assertTrue(AuditEvent.objects.filter(pk=expired.pk).exists())
        call_command("purge_audit_events",confirm=True,stdout=StringIO())
        self.assertFalse(AuditEvent.objects.filter(pk=expired.pk).exists())
        self.assertTrue(AuditEvent.objects.filter(pk=recent.pk).exists())
        event = AuditEvent.objects.get(action="audit.retention.purged")
        self.assertEqual(event.context["deleted_count"],1)
        self.assertEqual(event.context["origin"],"command:purge_audit_events")


    def test_restore_rejects_archive_paths_outside_destination(self):
        from .services import restore_backup
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root/"backup-unsafe.tar.gz"
            outside = root/"outside.txt"
            with tarfile.open(archive,"w:gz") as output:
                member = tarfile.TarInfo(str(outside))
                member.size = 1
                output.addfile(member,BytesIO(b"x"))
            with self.assertRaises((ValueError,tarfile.TarError)):
                restore_backup(archive.name,db_path=root/"db.sqlite3",media_root=root/"media",backup_dir=root)
            self.assertFalse(outside.exists())
        self.assertTrue(AuditEvent.objects.filter(action="backup.restore.failed").exists())
        self.assertFalse(AuditEvent.objects.filter(action="backup.restored").exists())



class AuditApiDetailsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username="audit-details", is_staff=True, is_superuser=True)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_diff_distinguishes_add_remove_change_null_and_unchanged(self):
        changes = snapshot_diff({"same":1,"removed":None,"nested":{"name":"Antes"},"array":[1]},
                                {"same":1,"added":None,"nested":{"name":"Depois"},"array":[1,2]})
        mapped = {row["path"]:row for row in changes}
        self.assertNotIn("same", mapped)
        self.assertEqual(mapped["nested.name"]["kind"], "changed")
        self.assertEqual(mapped["added"]["kind"], "added")
        self.assertFalse(mapped["added"]["before_present"])
        self.assertEqual(mapped["removed"]["kind"], "removed")
        self.assertEqual(mapped["array"]["after"], [1,2])
        self.assertEqual(snapshot_diff({"value":True},{"value":1})[0]["kind"],"changed")

    def test_legacy_secrets_are_redacted_in_snapshots_diff_reason_and_export(self):
        event = AuditEvent.objects.create(action="test.legacy", resource_type="test", before={"password":"old-secret", "nested":{"apiKey":"old-key"}},
            after={"password":"new-secret", "nested":{"apiKey":"new-key"}, "status":"active"}, reason="token=reason-secret",
            context={"authorization":"Bearer context-secret"})
        response = self.client.get("/api/backoffice/audit/?action=test.legacy")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["id"], event.pk)
        text = json.dumps(response.data, default=str)
        for secret in ("old-secret","new-secret","old-key","new-key","reason-secret","context-secret"):
            self.assertNotIn(secret,text)
        self.assertEqual([row["path"] for row in response.data["results"][0]["changes"]], ["status"])
        self.assertNotIn("reason-secret", self.client.get("/api/backoffice/audit/?action=test.legacy&export=csv").content.decode())

    def test_backup_http_metadata_has_one_domain_event(self):
        correlation = str(uuid4())
        with patch("apps.backoffice.services._create_backup", return_value="backup-http.tar.gz"):
            response = self.client.post("/api/backoffice/backups/", {}, format="json", HTTP_X_REQUEST_ID=correlation)
        self.assertEqual(response.status_code,201)
        event = AuditEvent.objects.get(action="backup.created")
        self.assertEqual(event.actor_id,self.admin.pk)
        self.assertEqual(str(event.request_id),correlation)
        self.assertEqual(event.context["origin"],"http")

    def test_moderation_http_has_single_event_and_correlation(self):
        question = Question.objects.create(statement="Questão HTTP",options=["A","B"],correct_answer=0,year=2026,banca="FGV",discipline="Direito")
        correlation = str(uuid4())
        response = self.client.patch("/api/backoffice/content/questions/", {"id":question.pk,"action":"approve","explanation":"Explicação longa e revisada. "*10}, format="json", HTTP_X_REQUEST_ID=correlation)
        self.assertEqual(response.status_code,200)
        event = AuditEvent.objects.get(action="question.approved")
        self.assertEqual(str(event.request_id),correlation)
        self.assertEqual(event.actor_id,self.admin.pk)

    def test_redaction_handles_uuid_and_free_text_credentials(self):
        identifier = uuid4()
        event = log(actor=self.admin, action="test.redact",resource_type="test",after={"id":identifier,"text":"Bearer abc123 api_key=secret-value"}, reason="password=unsafe")
        self.assertEqual(event.after["id"],str(identifier))
        self.assertNotIn("abc123",event.after["text"])
        self.assertNotIn("secret-value",event.after["text"])
        self.assertNotIn("unsafe",event.reason)

    def test_http_import_summary_preserves_actor_and_request_correlation(self):
        source = legacy_source()
        source.is_active = True
        source.save(update_fields=["is_active"])
        adapter = Mock(label="Sintética")
        adapter.validate_filters.return_value = {}
        adapter.fetch_questions.return_value = FetchResult(items=[QuestionItem(statement="Questão de auditoria por API",options=["A","B"],correct_answer=0,banca="FGV",year=2026,discipline="Direito")])
        correlation = str(uuid4())
        with patch("apps.questions.ingest.get_adapter", return_value=adapter):
            response = self.client.post("/api/backoffice/content/question-search/",{"source":source.slug},format="json",HTTP_X_REQUEST_ID=correlation)
        self.assertEqual(response.status_code,201,response.data)
        event = AuditEvent.objects.get(action="question_import.completed")
        self.assertEqual(str(event.request_id),correlation)
        self.assertEqual(event.actor_id,self.admin.pk)
        self.assertEqual(event.context["origin"],"http")
