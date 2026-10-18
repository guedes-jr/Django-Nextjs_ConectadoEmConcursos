from contextlib import nullcontext
from datetime import timedelta
import json
from pathlib import Path
import tempfile
from unittest.mock import MagicMock, Mock, patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.cache import cache
from django.db import connection, DatabaseError
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from . import diagnostics
from .models import AuditEvent


def forbidden_write():
    get_user_model().objects.create_user(username="diagnostic-forbidden-write")


def costly_query():
    with connection.cursor() as cursor:
        cursor.execute("WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x<100000000) SELECT sum(x) FROM cnt")
        return cursor.fetchone()[0]


def large_result():
    return {"payload": "x"*10000}


def secret_result():
    return {"password":"never-return", "nested":{"authorization":"Bearer private-token"}, "message":"token=inline-private"}


@override_settings(DIAGNOSTICS_ENABLED=True)
class DiagnosticToolsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username="tools-superuser",is_staff=True,is_superuser=True)
        cls.user.user_permissions.add(Permission.objects.get(content_type__app_label="backoffice",codename="access_diagnostics"))

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.user)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root/"application.log"
        self.path.write_text("")
        self.settings_override = override_settings(DIAGNOSTICS_LOG_FILES=(str(self.path),))
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def file_id(self):
        response = self.client.get("/api/backoffice/diagnostics/logs/")
        self.assertEqual(response.status_code,200)
        self.assertNotIn(str(self.root),json.dumps(response.data))
        return response.data["results"][0]["id"]

    def logs(self, **params):
        return self.client.get("/api/backoffice/diagnostics/logs/",{"service":self.file_id(),**params})

    def test_log_pagination_uses_stable_window_and_allows_append(self):
        self.path.write_text("line one\nline two\nline three\n")
        first = self.logs(limit=2)
        self.assertEqual(first.status_code,200)
        self.assertEqual(first.data["lines"],["line three","line two"])
        with self.path.open("a") as output:
            output.write("line four\n")
        second = self.logs(limit=2,page=2,snapshot=first.data["snapshot"])
        self.assertEqual(second.data["lines"],["line one"])
        self.assertEqual(second.data["total"],3)
        self.assertTrue(AuditEvent.objects.filter(action="diagnostics.logs.viewed").exists())

    def test_rotation_tampering_and_missing_snapshot_are_rejected(self):
        self.path.write_text("before\n")
        first = self.logs(limit=1)
        self.assertEqual(self.logs(page=2).status_code,400)
        self.assertEqual(self.logs(snapshot=first.data["snapshot"]+"tampered").status_code,400)
        self.path.rename(self.root/"previous.log")
        self.path.write_text("after\n")
        self.assertEqual(self.logs(snapshot=first.data["snapshot"]).status_code,400)

    def test_same_inode_rewrite_is_detected(self):
        self.path.write_text("old line\n")
        first = self.logs()
        self.path.write_text("new line\n")
        self.assertEqual(self.logs(snapshot=first.data["snapshot"]).status_code,400)

    def test_log_filters_json_and_plain_text_by_time_severity_correlation(self):
        self.path.write_text("\n".join([
            json.dumps({"timestamp":"2026-10-18T10:00:00Z","level":"ERROR","request_id":"request-1","message":"Database issue"}),
            "2026-10-18 11:00:00+00:00 WARNING request_id=request-2 Cache issue",
            "2026-10-18 12:00:00+00:00 INFO request_id=request-1 Done",
            "ERROR request_id=request-1 No timestamp",
        ])+"\n")
        response = self.logs(severity="ERROR",request_id="request-1",since="2026-10-18T09:00:00Z",until="2026-10-18T10:30:00Z",q="database")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data["total"],1)
        self.assertEqual(response.data["entries"][0]["request_id"],"request-1")
        response = self.logs(severity="WARNING",request_id="request-2")
        self.assertEqual(response.data["total"],1)
        self.assertEqual(self.logs(since="invalid").status_code,400)
        self.assertEqual(self.logs(severity="unknown").status_code,400)
        self.assertEqual(self.logs(since="2026-10-19T00:00:00Z",until="2026-10-18T00:00:00Z").status_code,400)

    def test_redaction_precedes_search_and_covers_quoted_secrets_and_headers(self):
        self.path.write_text('\n'.join([
            json.dumps({"level":"ERROR","password":"multi word private", "nested":{"apiKey":"hidden-key"}}),
            'WARNING password="another private secret" message=visible',
            'Authorization: Bearer hidden-auth; Cookie: sessionid=hidden-cookie',
        ])+'\n')
        response = self.logs()
        text = json.dumps(response.data)
        for secret in ("multi word private","hidden-key","another private secret","hidden-auth","hidden-cookie"):
            self.assertNotIn(secret,text)
        self.assertEqual(self.logs(q="hidden-key").data["total"],0)

    @override_settings(DIAGNOSTICS_LOG_MAX_BYTES=4096,DIAGNOSTICS_LOG_MAX_LINES=100)
    def test_large_file_and_long_line_are_bounded(self):
        self.path.write_bytes(b'x'*100000 + b'\nINFO latest safe\n')
        response = self.logs()
        self.assertLessEqual(response.data["bytes_read"],4096)
        self.assertTrue(response.data["window_limited"])
        self.assertIn("INFO latest safe",response.data["lines"])
        self.path.write_text(json.dumps({"password":"private "*2000})+'\n')
        with override_settings(DIAGNOSTICS_LOG_MAX_BYTES=1048576):
            response = self.logs()
        self.assertNotIn("private",json.dumps(response.data))
        self.assertIn("omitida",response.data["lines"][0])

    def test_non_allowlisted_paths_symlinks_and_duplicate_basenames(self):
        self.assertEqual(self.client.get("/api/backoffice/diagnostics/logs/",{"service":"../../etc/passwd"}).status_code,404)
        other_dir = self.root/"worker"
        other_dir.mkdir()
        other = other_dir/"application.log"
        other.write_text("worker")
        with override_settings(DIAGNOSTICS_LOG_FILES=(str(self.path),str(other))):
            response = self.client.get("/api/backoffice/diagnostics/logs/")
            ids = [row["id"] for row in response.data["results"]]
            self.assertEqual(len(set(ids)),2)
            self.assertNotIn(str(other_dir),json.dumps(response.data))
        target = self.root/"private.log"
        target.write_text("must not read")
        self.path.unlink()
        self.path.symlink_to(target)
        response = self.client.get("/api/backoffice/diagnostics/logs/")
        self.assertFalse(response.data["results"][0]["available"])

    @override_settings(DIAGNOSTICS_LOG_EXPORT_LINES=2)
    def test_download_is_redacted_limited_and_audited(self):
        self.path.write_text('INFO old\nINFO password="private download value"\nINFO latest\n')
        response = self.logs(export="txt")
        self.assertEqual(response.status_code,200)
        text = response.content.decode()
        self.assertEqual(len(text.splitlines()),2)
        self.assertNotIn("private download value",text)
        self.assertEqual(response["Cache-Control"],"no-store")
        self.assertEqual(response["X-Log-Limited"],"true")
        self.assertIn("attachment",response["Content-Disposition"])
        self.assertTrue(AuditEvent.objects.filter(action="diagnostics.logs.exported").exists())

    @override_settings(DIAGNOSTICS_LOG_EXPORT_MAX_BYTES=4096)
    def test_download_has_byte_budget_as_well_as_line_budget(self):
        self.path.write_text(("INFO "+"x"*1900+"\n")*20)
        response = self.logs(export="txt")
        self.assertLessEqual(len(response.content),4096)
        self.assertEqual(response["X-Log-Limited"],"true")

    def test_fixed_routine_hash_result_and_audit(self):
        response = self.client.post("/api/backoffice/diagnostics/scripts/",{"script":"summary-counts"},format="json")
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.data["script_hash"]),64)
        event = AuditEvent.objects.get(action="diagnostics.script.executed")
        self.assertEqual(event.context["script_hash"],response.data["script_hash"])
        self.assertEqual(event.after,response.data["result"])
        self.assertEqual(event.actor_id,self.user.pk)
        for payload in ({"script":"unknown"},{"script":"summary-counts","code":"print(1)"},[]):
            self.assertEqual(self.client.post("/api/backoffice/diagnostics/scripts/",payload,format="json").status_code,400)

    def run_test_routine(self, function):
        routine = {"title":"Test","description":"Test only","run":function}
        with patch.dict(diagnostics.ROUTINES,{"test-only":routine}):
            return self.client.post("/api/backoffice/diagnostics/scripts/",{"script":"test-only"},format="json")

    def test_read_only_guard_rejects_writes_and_restores_connection(self):
        response = self.run_test_routine(forbidden_write)
        self.assertEqual(response.status_code,503)
        self.assertFalse(get_user_model().objects.filter(username="diagnostic-forbidden-write").exists())
        get_user_model().objects.create_user(username="normal-write-after-diagnostic")
        self.assertTrue(AuditEvent.objects.filter(action="diagnostics.script.failed").exists())

    @override_settings(DIAGNOSTICS_QUERY_TIMEOUT_MS=100)
    def test_sqlite_query_deadline_interrupts_expensive_query(self):
        response = self.run_test_routine(costly_query)
        self.assertEqual(response.status_code,503)
        self.assertIn("OperationalError",AuditEvent.objects.get(action="diagnostics.script.failed").context["error_type"])
        get_user_model().objects.create_user(username="normal-write-after-timeout")

    @override_settings(DIAGNOSTICS_RESULT_MAX_BYTES=1024)
    def test_routine_output_is_limited_before_persisting_audit(self):
        response = self.run_test_routine(large_result)
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.data["truncated"])
        self.assertLess(len(json.dumps(response.data["result"])),1024)
        event = AuditEvent.objects.get(action="diagnostics.script.executed")
        self.assertNotIn("x"*2000,json.dumps(event.after))

    def test_routine_result_is_redacted_before_response_and_audit(self):
        response = self.run_test_routine(secret_result)
        self.assertEqual(response.status_code,200)
        event = AuditEvent.objects.get(action="diagnostics.script.executed")
        for text in (json.dumps(response.data),json.dumps(event.after)):
            self.assertNotIn("never-return",text)
            self.assertNotIn("private-token",text)
            self.assertNotIn("inline-private",text)

    def test_database_size_and_failure_do_not_expose_connection_details(self):
        response = self.client.get("/api/backoffice/diagnostics/database/")
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.data["connected"])
        self.assertGreater(response.data["size"],0)
        self.assertIsInstance(response.data["pending_migrations"],int)
        with patch("apps.backoffice.diagnostics.read_only_queries",side_effect=DatabaseError("password=private-db")):
            result = diagnostics.database_snapshot()
        self.assertFalse(result["connected"])
        self.assertNotIn("private-db",json.dumps(result))

    def test_service_snapshots_report_real_age_and_ignore_unapproved_fields(self):
        health = self.root/"health.json"
        health.write_text(json.dumps({"worker":{"status":"ok","checked_at":timezone.now().isoformat(),"latency_ms":2,"detail":"password=private-health","token":"hidden"},
            "frontend":{"status":"down","checked_at":(timezone.now()-timedelta(hours=1)).isoformat()},
            "proxy":{"status":["bad"],"checked_at":timezone.now().isoformat()}}))
        with override_settings(DIAGNOSTICS_HEALTH_FILE=str(health)):
            response = self.client.get("/api/backoffice/diagnostics/services/")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data["worker"]["status"],"ok")
        self.assertEqual(response.data["frontend"]["status"],"stale")
        self.assertEqual(response.data["scheduler"]["status"],"unavailable")
        self.assertEqual(response.data["proxy"]["status"],"stale")
        self.assertNotIn("private-health",json.dumps(response.data,default=str))
        self.assertNotIn(str(health),json.dumps(response.data,default=str))
        with override_settings(DIAGNOSTICS_HEALTH_FILE=""):
            self.assertEqual(diagnostics.service_snapshot()["worker"]["status"],"not_configured")

    @override_settings(DIAGNOSTICS_REQUESTS_PER_MINUTE=1)
    def test_diagnostic_rate_limit_is_per_user(self):
        self.assertEqual(self.client.get("/api/backoffice/diagnostics/services/").status_code,200)
        response = self.client.get("/api/backoffice/diagnostics/services/")
        self.assertEqual(response.status_code,429)
        self.assertIn("Retry-After",response)

    @override_settings(DIAGNOSTICS_ROUTINES_PER_MINUTE=1)
    def test_routine_rate_does_not_block_catalog_reads(self):
        self.assertEqual(self.client.get("/api/backoffice/diagnostics/scripts/").status_code,200)
        self.assertEqual(self.client.get("/api/backoffice/diagnostics/scripts/").status_code,200)
        payload = {"script":"summary-counts"}
        self.assertEqual(self.client.post("/api/backoffice/diagnostics/scripts/",payload,format="json").status_code,200)
        self.assertEqual(self.client.post("/api/backoffice/diagnostics/scripts/",payload,format="json").status_code,429)

    def test_logs_download_requires_explicit_diagnostic_access(self):
        identifier = self.file_id()
        self.user.user_permissions.clear()
        self.assertEqual(self.client.get("/api/backoffice/diagnostics/logs/",{"service":identifier,"export":"txt"}).status_code,404)
        self.assertFalse(AuditEvent.objects.filter(action="diagnostics.logs.exported").exists())

    def test_malformed_log_metadata_cannot_bypass_redaction(self):
        self.path.write_text(json.dumps({"level":{"password":"bad-level-secret"},"request_id":{"token":"bad-id-secret"},"message":"safe"})+"\n")
        response = self.logs()
        self.assertEqual(response.status_code,200)
        self.assertNotIn("bad-level-secret",json.dumps(response.data))
        self.assertNotIn("bad-id-secret",json.dumps(response.data))
        self.assertEqual(response.data["entries"][0]["request_id"],"")
        self.assertEqual(response.data["entries"][0]["severity"],"")

    @override_settings(DIAGNOSTICS_SLOW_QUERY_STATS=True)
    def test_postgresql_collector_returns_aggregates_without_query_text(self):
        cursor = MagicMock()
        cursor.__enter__.return_value = cursor
        cursor.fetchone.side_effect = [("16.6",),(123456,),(4,),("pg_stat_statements",),(10,25.5,300.0)]
        database = Mock(vendor="postgresql")
        database.cursor.return_value = cursor
        executor = Mock()
        executor.migration_plan.return_value = []
        with patch.object(diagnostics,"connection",database),patch.object(diagnostics,"read_only_queries",return_value=nullcontext()),patch.object(diagnostics,"MigrationExecutor",return_value=executor):
            result = diagnostics.database_snapshot()
        self.assertTrue(result["connected"])
        self.assertEqual(result["size"],123456)
        self.assertEqual(result["active_connections"],4)
        self.assertEqual(result["slow_queries"]["calls"],10)
        self.assertEqual(result["slow_queries"]["slowest_mean_ms"],25.5)
        self.assertNotIn("query",result["slow_queries"])

    def test_postgresql_guard_allows_only_reads_and_restores_timeout(self):
        cursor = MagicMock()
        cursor.__enter__.return_value = cursor
        cursor.fetchone.return_value = ("15s",)
        database = Mock(vendor="postgresql",in_atomic_block=False)
        database.cursor.return_value = cursor
        installed = {}
        def install(wrapper):
            installed["wrapper"] = wrapper
            return nullcontext()
        database.execute_wrapper.side_effect = install
        execute = Mock()
        with patch.object(diagnostics,"connection",database),patch.object(diagnostics.transaction,"atomic",return_value=nullcontext()):
            with diagnostics.read_only_queries():
                with self.assertRaises(DatabaseError):
                    installed["wrapper"](execute,"DELETE FROM auth_user",[],False,{})
                installed["wrapper"](execute,"SELECT 1",[],False,{})
        self.assertIn((("SET TRANSACTION READ ONLY",),{}),[(call.args,call.kwargs) for call in cursor.execute.call_args_list])
        self.assertEqual(cursor.execute.call_args.args,("SELECT set_config('statement_timeout', %s, true)",["15s"]))
        self.assertEqual(execute.call_args.args[0],"SELECT 1")

    @override_settings(DIAGNOSTICS_LOG_MAX_LINES=100)
    def test_line_budget_includes_exactly_one_hundred_complete_lines(self):
        self.path.write_text("".join(f"INFO item {index}\n" for index in range(100)))
        response = self.logs(limit=100)
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.data["lines"]),100)
        self.assertFalse(response.data["window_limited"])
