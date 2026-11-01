from datetime import datetime, time, timedelta, timezone as dt_timezone
from io import StringIO
from pathlib import Path
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AuditEvent, OperationalRoutine, RoutineExecution, RoutineSchedule
from .routines import CATALOG, LOG_LIMIT, RunLog, claim, dispatch, next_run


class RoutineTestBase(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        config = override_settings(BACKUP_DIR=Path(self.temp.name)); config.enable(); self.addCleanup(config.disable)
        RoutineSchedule.objects.update(enabled=False)
        self.schedule = RoutineSchedule.objects.get(routine_id="publish_news")
        self.schedule.enabled = True
        self.schedule.next_run_at = timezone.now() - timedelta(minutes=1)
        self.schedule.save()


class RoutineRunnerTests(RoutineTestBase):
    def test_seed_matches_existing_operational_routines(self):
        self.assertEqual(set(OperationalRoutine.objects.values_list("pk", flat=True)), set(CATALOG))
        backup = RoutineSchedule.objects.get(routine_id="backup")
        self.assertEqual(backup.time_of_day, time(3, 15))
        self.assertEqual(backup.timezone_name, "America/Fortaleza")

    def test_due_run_is_persisted_and_second_tick_does_not_repeat(self):
        def command(*args, stdout, **kwargs):
            stdout.write("Publicação concluída.\n")
        with patch("apps.backoffice.routines.call_command", side_effect=command) as run:
            self.assertEqual(dispatch(["publish_news"])["success"], 1)
            self.assertEqual(dispatch(["publish_news"])["success"], 0)
        self.assertEqual(run.call_count, 1)
        execution = RoutineExecution.objects.get()
        self.assertEqual(execution.status, "success")
        self.assertIn("Publicação concluída", execution.log)
        self.assertIsNotNone(execution.finished_at)
        self.assertIsNotNone(execution.duration_ms)
        self.assertTrue(AuditEvent.objects.filter(action="routine.completed").exists())

    def test_failed_command_records_redacted_traceback_and_reports_failure(self):
        with patch("apps.backoffice.routines.call_command", side_effect=CommandError("secret=do-not-store password=hidden failure")):
            with self.assertRaises(CommandError):
                call_command("run_scheduled_routines", routine=["publish_news"], stdout=StringIO())
        execution = RoutineExecution.objects.get()
        self.assertEqual(execution.status, "error")
        self.assertIn("CommandError", execution.log)
        self.assertNotIn("do-not-store", execution.log)
        self.assertNotIn("hidden", execution.log)
        self.assertTrue(AuditEvent.objects.filter(action="routine.failed").exists())

    def test_pause_and_future_schedule_are_not_executed(self):
        self.schedule.enabled = False; self.schedule.save()
        with patch("apps.backoffice.routines.call_command") as run:
            dispatch()
            run.assert_not_called()
        self.schedule.enabled = True
        self.schedule.next_run_at = timezone.now() + timedelta(days=1); self.schedule.save()
        with patch("apps.backoffice.routines.call_command") as run:
            dispatch()
            run.assert_not_called()

    def test_active_run_blocks_other_schedules_of_same_routine(self):
        execution = claim(self.schedule.pk, timezone.now())
        other = RoutineSchedule.objects.create(routine_id="publish_news", name="Outra publicação", enabled=True,
            frequency="interval", interval_minutes=1, next_run_at=timezone.now() - timedelta(minutes=1))
        self.assertIsNone(claim(other.pk, timezone.now()))
        self.assertEqual(RoutineExecution.objects.count(), 1)
        self.assertEqual(execution.status, "running")

    def test_interruption_is_detected_even_if_next_occurrence_is_not_due(self):
        execution = claim(self.schedule.pk, timezone.now())
        RoutineExecution.objects.filter(pk=execution.pk).update(started_at=timezone.now() - timedelta(hours=1))
        self.schedule.enabled = False; self.schedule.save()
        with patch("apps.backoffice.routines.call_command") as run:
            dispatch(["publish_news"])
            run.assert_not_called()
        execution.refresh_from_db()
        self.assertEqual(execution.status, "interrupted")
        self.assertIn("interrompida", execution.log)
        self.assertIsNotNone(OperationalRoutine.objects.get(pk="publish_news").last_tick_at)

    def test_missed_occurrences_run_once_and_advance_from_current_time(self):
        self.schedule.next_run_at = timezone.now() - timedelta(days=7); self.schedule.save()
        with patch("apps.backoffice.routines.call_command") as run:
            dispatch(["publish_news"])
            self.assertEqual(run.call_count, 1)
        self.schedule.refresh_from_db()
        self.assertGreater(self.schedule.next_run_at, timezone.now())

    def test_daily_uses_explicit_timezone_and_rolls_to_next_day(self):
        self.schedule.frequency, self.schedule.time_of_day = "daily", time(3, 15)
        self.schedule.timezone_name = "America/Fortaleza"
        now = datetime(2026, 11, 1, 6, 14, tzinfo=dt_timezone.utc)
        self.assertEqual(next_run(self.schedule, now).astimezone(dt_timezone.utc).hour, 6)
        self.assertEqual(next_run(self.schedule, now + timedelta(minutes=1)).day, 2)

    def test_log_is_bounded_and_redacted(self):
        output = RunLog()
        output.write('{"client_secret":"nope","message":"safe"}\n')
        output.write("x" * (LOG_LIMIT * 4))
        clean, truncated = output.result()
        self.assertNotIn("nope", clean)
        self.assertLessEqual(len(clean.encode()), LOG_LIMIT)
        self.assertTrue(truncated)

    def test_real_publication_command_uses_dispatcher_on_isolated_fixture(self):
        from apps.concursos.models import NewsArticle
        article = NewsArticle.objects.create(title="Artigo agendado", slug="routine-fixture", source="manual", external_id="fixture",
            body="Conteúdo sintético", editorial_status="scheduled", is_published=False, scheduled_for=timezone.now() - timedelta(minutes=1))
        dispatch(["publish_news"])
        article.refresh_from_db()
        self.assertTrue(article.is_published)
        self.assertEqual(RoutineExecution.objects.get().status, "success")


class RoutineAPITests(RoutineTestBase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_superuser("routine-admin", email="routine@example.test", password="synthetic-password")
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.data = {"routine": "backup", "name": "Cópia extra", "enabled": True, "frequency": "daily",
                     "interval_minutes": 60, "time_of_day": "22:10", "timezone_name": "America/Fortaleza"}

    def test_create_update_and_pause_without_executing(self):
        with patch("apps.backoffice.routines.call_command") as run:
            response = self.client.post("/api/backoffice/routines/", self.data, format="json")
            self.assertEqual(response.status_code, 201)
            item_id = response.data["id"]
            response = self.client.put(f"/api/backoffice/routines/{item_id}/", {**self.data, "enabled": False, "time_of_day": "23:30"}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.data["enabled"])
            self.assertEqual(response.data["time_of_day"], "23:30")
            run.assert_not_called()
        self.assertEqual(AuditEvent.objects.filter(action__startswith="routine.schedule_").count(), 2)

    def test_invalid_command_interval_time_and_timezone_are_rejected(self):
        for patch_data in [{"routine": "restore_db"}, {"interval_minutes": 0}, {"interval_minutes": 43201}, {"time_of_day": "25:30"},
                           {"timezone_name": "invalid-zone"}, {"command": "rm -rf"}]:
            response = self.client.post("/api/backoffice/routines/", {**self.data, **patch_data}, format="json")
            self.assertEqual(response.status_code, 400)

    def test_normal_staff_cannot_manage_or_read_execution_history(self):
        staff = get_user_model().objects.create_user("routine-staff", is_staff=True)
        self.client.force_authenticate(staff)
        for path in ["/api/backoffice/routines/", "/api/backoffice/routine-executions/"]:
            self.assertEqual(self.client.get(path).status_code, 403)
        self.assertEqual(self.client.post("/api/backoffice/routines/", self.data, format="json").status_code, 403)

    def test_history_is_paginated_filterable_and_does_not_include_log_body(self):
        with patch("apps.backoffice.routines.call_command", side_effect=RuntimeError("synthetic failure")):
            dispatch(["publish_news"])
        response = self.client.get("/api/backoffice/routine-executions/", {"status": "error", "routine": "publish_news", "page_size": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"]["error"], 1)
        self.assertNotIn("log", response.data["results"][0])
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(self.client.get("/api/backoffice/routine-executions/", {"page_size": 1000}).status_code, 400)

    @override_settings(DIAGNOSTICS_ENABLED=True)
    def test_log_requires_explicit_diagnostics_permission_and_is_audited(self):
        with patch("apps.backoffice.routines.call_command", side_effect=RuntimeError("synthetic failure")):
            dispatch(["publish_news"])
        execution = RoutineExecution.objects.get()
        path = f"/api/backoffice/routine-executions/{execution.pk}/"
        self.assertEqual(self.client.get(path).status_code, 404)
        permission = Permission.objects.get(content_type__app_label="backoffice", codename="access_diagnostics")
        self.user.user_permissions.add(permission)
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)
        self.assertIn("synthetic failure", response.data["log"])
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertTrue(AuditEvent.objects.filter(action="routine.log_viewed").exists())

    def test_schedule_cannot_change_underlying_routine(self):
        response = self.client.put(f"/api/backoffice/routines/{self.schedule.pk}/", self.data, format="json")
        self.assertEqual(response.status_code, 400)

    def test_catalog_exposes_no_executable_or_host_paths(self):
        response = self.client.get("/api/backoffice/routines/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("command", str(response.data))
        self.assertFalse(response.data["catalog"][0]["executor_active"])

    def test_remove_hides_schedule_stops_future_runs_and_preserves_history(self):
        with patch("apps.backoffice.routines.call_command"):
            dispatch(["publish_news"])
        execution = RoutineExecution.objects.get()
        response = self.client.delete(f"/api/backoffice/routines/{self.schedule.pk}/")
        self.assertEqual(response.status_code, 200)
        self.schedule.refresh_from_db()
        self.assertFalse(self.schedule.enabled)
        self.assertIsNotNone(self.schedule.removed_at)
        self.assertNotIn(self.schedule.pk, [row["id"] for row in self.client.get("/api/backoffice/routines/").data["results"]])
        self.assertTrue(RoutineExecution.objects.filter(pk=execution.pk, schedule=self.schedule).exists())
        history = self.client.get("/api/backoffice/routine-executions/").data
        self.assertEqual(history["count"], 1)
        self.assertTrue(AuditEvent.objects.filter(action="routine.schedule_removed", resource_id=str(self.schedule.pk)).exists())
        with patch("apps.backoffice.routines.call_command") as run:
            dispatch(["publish_news"])
            run.assert_not_called()
        payload = {**self.data, "routine": "publish_news"}
        self.assertEqual(self.client.put(f"/api/backoffice/routines/{self.schedule.pk}/", payload, format="json").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/backoffice/routines/{self.schedule.pk}/").status_code, 404)

    def test_removal_is_forbidden_to_ordinary_staff(self):
        staff = get_user_model().objects.create_user("routine-removal-staff", is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.delete(f"/api/backoffice/routines/{self.schedule.pk}/").status_code, 403)
        self.schedule.refresh_from_db()
        self.assertIsNone(self.schedule.removed_at)
