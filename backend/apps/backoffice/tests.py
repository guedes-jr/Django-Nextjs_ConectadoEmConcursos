import sqlite3
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.backoffice import services
from apps.billing.models import Plan, Subscription
from apps.concursos.models import NewsArticle
from apps.questions.models import Question
from apps.workspace.models import CommunityPost, ExamSubmission

User = get_user_model()


class Base(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user("admin-user", password="password", is_staff=True)
        self.user = User.objects.create_user("regular-user", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.staff)
        self.gratis = Plan.objects.get(slug="gratis")
        self.padrao = Plan.objects.get(slug="padrao")
        self.sub = Subscription.objects.create(user=self.user, plan=self.padrao, cycle="anual", status=Subscription.Status.PENDING)


class OverviewTests(Base):
    def test_requires_staff(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/backoffice/overview/")
        self.assertEqual(response.status_code, 403)

    def test_overview_counts(self):
        response = self.client.get("/api/backoffice/overview/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["users"]["total"], 2)
        self.assertEqual(response.data["subscriptions"]["pending_payment"], 1)
        self.assertEqual(response.data["subscriptions"]["total"], 1)


class SubscriptionAdminTests(Base):
    def test_lists_subscriptions_with_filters(self):
        response = self.client.get("/api/backoffice/subscriptions/?status=pending_payment")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_updates_subscription(self):
        response = self.client.patch(
            f"/api/backoffice/subscriptions/{self.sub.id}/",
            {"status": Subscription.Status.ACTIVE, "cycle": "semestral"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], Subscription.Status.ACTIVE)
        self.assertEqual(response.data["cycle"], "semestral")

    def test_changes_plan(self):
        response = self.client.patch(
            f"/api/backoffice/subscriptions/{self.sub.id}/",
            {"plan": self.gratis.slug},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["plan_slug"], self.gratis.slug)


class PlansAdminTests(Base):
    def test_creates_plan(self):
        response = self.client.post(
            "/api/backoffice/plans/",
            {"slug": "teste", "name": "Plano Teste", "monthly_price": "19.90", "features": ["1"]},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Plan.objects.filter(slug="teste").count(), 1)

    def test_toggles_plan(self):
        plan = Plan.objects.create(slug="teste", name="Plano Teste")
        response = self.client.patch(f"/api/backoffice/plans/{plan.id}/", {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])

    def test_cannot_delete_plan_in_use(self):
        response = self.client.delete(f"/api/backoffice/plans/{self.padrao.id}/")
        self.assertEqual(response.status_code, 400)


class UsersAdminTests(Base):
    def test_searches_users(self):
        response = self.client.get("/api/backoffice/users/?search=regular")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["username"], "regular-user")

    def test_toggles_active(self):
        response = self.client.patch(f"/api/backoffice/users/{self.user.id}/", {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

    def test_assigns_subscription(self):
        response = self.client.post(
            f"/api/backoffice/users/{self.user.id}/subscription/",
            {"plan": self.gratis.slug, "cycle": Subscription.Cycle.MONTHLY},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.plan, self.gratis)
        self.assertEqual(self.sub.status, Subscription.Status.ACTIVE)


class ContentAdminTests(Base):
    def test_lists_uncommented_questions_and_edits(self):
        q = Question.objects.create(
            source_id="q1",
            discipline="Matemática",
            banca="CESPE",
            year=2024,
            statement="Enunciado",
            options=["a"],
            correct_answer=0,
        )
        response = self.client.get("/api/backoffice/content/questions/?only_uncommented=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        response = self.client.patch(
            "/api/backoffice/content/questions/", {"id": q.id, "explanation": "Resposta explicada"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        q.refresh_from_db()
        self.assertEqual(q.explanation, "Resposta explicada")

    def test_toggles_news(self):
        news = NewsArticle.objects.create(
            source="x", external_id="n1", slug="noticia-1", title="Notícia", is_published=True
        )
        response = self.client.patch(
            "/api/backoffice/content/news/", {"id": news.id, "is_published": False}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        news.refresh_from_db()
        self.assertFalse(news.is_published)

    def test_deletes_community_post(self):
        post = CommunityPost.objects.create(user=self.user, kind="post", title="Spam")
        response = self.client.delete(f"/api/backoffice/content/community/?id={post.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(CommunityPost.objects.count(), 0)

    def test_lists_proofs_and_toggles_status(self):
        proof = ExamSubmission.objects.create(user=self.user, title="Prova X", status=ExamSubmission.Status.PENDING)
        response = self.client.get("/api/backoffice/content/proofs/?status=pending")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        response = self.client.patch(
            "/api/backoffice/content/proofs/", {"id": proof.id, "status": "reviewed"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        proof.refresh_from_db()
        self.assertEqual(proof.status, ExamSubmission.Status.REVIEWED)

class BackupTests(TransactionTestCase):
    """Usa TransactionTestCase: sem transação pendente, o backup via
    sqlite3 não fica preso no lock do arquivo durante o teste."""

    def _seed(self, base):
        db = base / "livro.sqlite3"
        con = sqlite3.connect(db)
        con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
        con.execute("INSERT INTO t (v) VALUES ('original')")
        con.commit()
        con.close()
        media = base / "media"
        (media / "img").mkdir(parents=True)
        (media / "img" / "a.png").write_text("png")
        return db, media

    def test_create_and_list_backups(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(BACKUP_DIR=tmp):
            base = Path(tmp)
            db, media = self._seed(base)
            name = services.create_backup(db_path=db, media_root=media)
            self.assertTrue(name.endswith(".tar.gz"))
            items = services.list_backups()
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["name"], name)

    def test_restore_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(BACKUP_DIR=tmp):
            base = Path(tmp)
            db, media = self._seed(base)
            name = services.create_backup(db_path=db, media_root=media)

            con = sqlite3.connect(db)
            con.execute("DELETE FROM t")
            con.execute("INSERT INTO t (v) VALUES ('modificado')")
            con.commit()
            con.close()
            (media / "img" / "b.png").write_text("png2")

            result = services.restore_backup(name, db_path=db, media_root=media)
            self.assertEqual(result["restored"], name)
            self.assertTrue(result["previous_db_saved_at"].endswith(".sqlite3.bak"))

            con = sqlite3.connect(db)
            value = con.execute("SELECT v FROM t").fetchone()[0]
            con.close()
            self.assertEqual(value, "original")
            self.assertTrue((media / "img" / "a.png").exists())
            self.assertFalse((media / "img" / "b.png").exists())

    def test_restore_rejects_unknown(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(BACKUP_DIR=tmp):
            with self.assertRaises(ValueError):
                services.restore_backup("backup-inexistente.tar.gz")