from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import override_settings
from django.urls import resolve
from rest_framework.test import APITestCase, APIRequestFactory
from rest_framework.request import Request

from apps.backoffice.models import AuditEvent
from apps.backoffice.permissions import ROLE_GROUPS


class BackofficePermissionTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.users = {}
        for role in ("staff", "admin", "editor", "reviewer", "superuser", "student"):
            user = get_user_model().objects.create_user(
                username=f"permission-{role}", is_staff=role != "student",
                is_superuser=role == "superuser",
            )
            if role in ROLE_GROUPS:
                user.groups.add(Group.objects.get(name=ROLE_GROUPS[role]))
            cls.users[role] = user

    def assert_endpoint_permissions(self, url, method, allowed):
        view = resolve(url).func.cls()
        for role, user in self.users.items():
            with self.subTest(url=url, method=method, role=role):
                request = Request(APIRequestFactory().generic(method, url))
                request.user = user
                self.assertEqual(
                    all(permission.has_permission(request, view) for permission in view.get_permissions()),
                    role in allowed,
                )

    def test_editorial_writes_and_legacy_routes(self):
        for url, method in (
            ("/api/backoffice/content/bancas/", "POST"),
            ("/api/backoffice/content/bancas/1/", "PATCH"),
            ("/api/backoffice/content/bancas/1/aliases/", "POST"),
            ("/api/backoffice/content/editorial/concursos/", "POST"),
            ("/api/backoffice/content/editorial/provas/1/", "PATCH"),
            ("/api/backoffice/content/editorial/artigos/", "POST"),
            ("/api/backoffice/content/news/", "PATCH"),
            ("/api/backoffice/content/questions/manual/", "POST"),
            ("/api/backoffice/content/question-search/", "POST"),
            ("/api/backoffice/notifications/", "POST"),
            ("/api/backoffice/notifications/1/", "PATCH"),
        ):
            self.assert_endpoint_permissions(url, method, {"admin", "editor", "superuser"})

    def test_review_writes_include_legacy_question_endpoint(self):
        for url in (
            "/api/backoffice/content/questions/approve/",
            "/api/backoffice/content/questions/reject/",
            "/api/backoffice/content/questions/draft/",
            "/api/backoffice/content/questions/manual/1/submit/",
            "/api/backoffice/content/questions/manual/1/publish/",
            "/api/backoffice/content/questions/manual/1/unpublish/",
        ):
            self.assert_endpoint_permissions(url, "POST", {"admin", "reviewer", "superuser"})
        self.assert_endpoint_permissions("/api/backoffice/content/questions/", "PATCH", {"admin", "reviewer", "superuser"})

    def test_campaign_transitions_are_administrator_only(self):
        for action in ("publish", "close", "archive"):
            self.assert_endpoint_permissions(f"/api/backoffice/notifications/1/{action}/", "POST", {"admin", "superuser"})

    def test_editorial_reads_and_administrative_operations(self):
        for url in ("/api/backoffice/content/bancas/", "/api/backoffice/content/questions/queue/", "/api/backoffice/notifications/"):
            self.assert_endpoint_permissions(url, "GET", {"staff", "admin", "editor", "reviewer", "superuser"})
        for url in ("/api/backoffice/users/", "/api/backoffice/backups/", "/api/backoffice/plans/"):
            self.assert_endpoint_permissions(url, "POST", {"admin", "superuser"})

    def test_audit_read_and_export_are_superuser_only(self):
        for role, user in self.users.items():
            self.client.force_authenticate(user)
            for suffix in ("", "?export=csv"):
                response = self.client.get("/api/backoffice/audit/" + suffix)
                self.assertEqual(response.status_code, 200 if role == "superuser" else 403)

    def test_denied_requests_do_not_write_data(self):
        self.client.force_authenticate(self.users["reviewer"])
        response = self.client.post("/api/backoffice/notifications/", {"title": "Denied"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(AuditEvent.objects.filter(action="notification.created").exists())
        self.client.force_authenticate(self.users["editor"])
        self.assertEqual(self.client.post("/api/backoffice/content/questions/approve/", {}, format="json").status_code, 403)

    @override_settings(DIAGNOSTICS_ENABLED=True)
    def test_diagnostics_require_explicit_permission_even_for_superuser(self):
        permission = Permission.objects.get(content_type__app_label="backoffice", codename="access_diagnostics")
        urls = [f"/api/backoffice/diagnostics/{name}/" for name in ("overview", "services", "database", "logs", "scripts")]
        for role in ("admin", "superuser"):
            user = self.users[role]
            self.client.force_authenticate(user)
            for url in urls:
                self.assertEqual(self.client.get(url).status_code, 404)
            user.user_permissions.add(permission)
            for url in urls:
                self.assertEqual(self.client.get(url).status_code, 200 if role == "superuser" else 404)
        with override_settings(DIAGNOSTICS_ENABLED=False):
            self.assertEqual(self.client.get(urls[0]).status_code, 404)

    def test_inactive_and_nonstaff_group_members_cannot_write(self):
        user = self.users["admin"]
        for field in ("is_active", "is_staff"):
            setattr(user, field, False)
            self.assert_endpoint_permissions("/api/backoffice/notifications/", "POST", {"editor", "superuser"})
            setattr(user, field, True)

    def test_editor_can_create_draft_and_reviewer_can_submit_it(self):
        self.client.force_authenticate(self.users["editor"])
        response = self.client.post("/api/backoffice/content/questions/manual/", {
            "statement": "Uma questão manual para validar as permissões editoriais.",
            "banca": "FGV", "discipline": "Direito", "year": 2026,
            "options": ["Alternativa A", "Alternativa B"], "correct_answer": 0,
            "source_url": "https://example.org/prova",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        question_id = response.data["id"]
        self.assertEqual(self.client.post(f"/api/backoffice/content/questions/manual/{question_id}/submit/", {}, format="json").status_code, 403)
        self.client.force_authenticate(self.users["reviewer"])
        response = self.client.post(f"/api/backoffice/content/questions/manual/{question_id}/submit/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "pending")

    def test_editor_can_select_recipients_without_user_management_access(self):
        self.client.force_authenticate(self.users["editor"])
        response = self.client.get("/api/backoffice/notifications/options/?search=permission-student")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(set(response.data["results"][0]), {"id", "username", "email"})
        self.assertEqual(self.client.get("/api/backoffice/users/").status_code, 403)
        response = self.client.post("/api/backoffice/notifications/", {
            "title": "Aviso editorial", "body": "Texto do aviso",
            "scope": "selected_users", "selected_user_ids": [self.users["student"].pk],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.post(f"/api/backoffice/notifications/{response.data['id']}/publish/", {}, format="json").status_code, 403)
        self.client.force_authenticate(self.users["admin"])
        self.assertEqual(self.client.post(f"/api/backoffice/notifications/{response.data['id']}/publish/", {}, format="json").status_code, 200)

    def test_anonymous_cannot_read_editorial_or_audit_records(self):
        for url in ("/api/backoffice/content/bancas/", "/api/backoffice/audit/", "/api/backoffice/notifications/options/"):
            self.assertEqual(self.client.get(url).status_code, 403)
