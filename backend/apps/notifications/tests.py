from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from config.asgi import application

from . import services
from .models import Notification, NotificationCategory, NotificationPreference

MEMORY_CHANNELS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


@override_settings(CHANNEL_LAYERS=MEMORY_CHANNELS)
class NotificationServiceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="aluno", password="safe-test-pass")

    def test_notify_creates_in_app_notification(self):
        notification = services.notify(self.user, "studies", "Hora de estudar", link="/study")
        self.assertIsNotNone(notification)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertFalse(notification.is_read)
        self.assertEqual(notification.link, "/study")

    def test_notify_respects_disabled_preference(self):
        NotificationPreference.objects.create(user=self.user, category="studies", enabled=False)
        notification = services.notify(self.user, "studies", "Ignorado")
        self.assertIsNone(notification)
        self.assertEqual(Notification.objects.count(), 0)

    def test_mark_read(self):
        first = services.notify(self.user, "studies", "Um")
        services.notify(self.user, "studies", "Dois")
        count = services.mark_read(self.user, [first.pk])
        self.assertEqual(count, 1)
        self.assertEqual(services.unread_count(self.user), 1)

    def test_mark_read_all(self):
        services.notify(self.user, "studies", "Um")
        services.notify(self.user, "questions", "Dois")
        self.assertEqual(services.mark_read_all(self.user), 2)
        self.assertEqual(services.unread_count(self.user), 0)

    def test_serialize_contains_fields(self):
        notification = services.notify(self.user, "billing", "Assinatura ativa")
        payload = services.serialize(notification)
        self.assertEqual(payload["category"], "billing")
        self.assertEqual(payload["title"], "Assinatura ativa")
        self.assertIn("created_at", payload)


@override_settings(CHANNEL_LAYERS=MEMORY_CHANNELS)
class NotificationApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="aluno", password="safe-test-pass")
        self.other = get_user_model().objects.create_user(username="outro", password="safe-test-pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _seed(self, n=3, category="studies"):
        ids = []
        for i in range(n):
            notification = services.notify(self.user, category, f"Título {i}", link="/study")
            ids.append(notification.pk)
        return ids

    def test_list_and_unread_count(self):
        self._seed()
        data = self.client.get("/api/notifications/").data
        self.assertEqual(data["count"], 3)
        self.assertEqual(data["unread"], 3)
        self.assertEqual(len(data["results"]), 3)
        unread = self.client.get("/api/notifications/unread-count/").data
        self.assertEqual(unread["unread"], 3)

    def test_filter_unread_and_category(self):
        self._seed()
        self._seed(1, category="questions")
        data = self.client.get("/api/notifications/?category=questions").data
        self.assertEqual(data["count"], 1)
        static = self.client.get("/api/notifications/?unread=1").data
        self.assertEqual(static["count"], 4)

    def test_mark_read_and_read_all(self):
        ids = self._seed()
        response = self.client.post("/api/notifications/read/", {"ids": [ids[0]]}, format="json")
        self.assertEqual(response.data["read"], 1)
        self.assertEqual(services.unread_count(self.user), 2)
        response = self.client.post("/api/notifications/read-all/", {}, format="json")
        self.assertEqual(response.data["read"], 2)
        self.assertEqual(services.unread_count(self.user), 0)

    def test_mark_read_invalid_ids(self):
        response = self.client.post("/api/notifications/read/", {"ids": ["x"]}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_privacy_no_leak(self):
        self._seed()
        services.notify(self.other, "billing", "Outro usuário")
        data = self.client.get("/api/notifications/").data
        self.assertEqual(data["count"], 3)

    def test_pagination(self):
        self._seed(25)
        page1 = self.client.get("/api/notifications/").data
        self.assertEqual(len(page1["results"]), 20)
        self.assertTrue(page1["next"])
        page2 = self.client.get("/api/notifications/?page=2").data
        self.assertEqual(len(page2["results"]), 5)

    def test_preferences_default_and_update(self):
        data = self.client.get("/api/notifications/preferences/").data
        self.assertEqual(len(data["preferences"]), len(NotificationCategory.choices))
        self.assertTrue(all(item["enabled"] for item in data["preferences"]))
        response = self.client.put(
            "/api/notifications/preferences/",
            {"preferences": [{"category": "studies", "enabled": False}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        prefs = self.client.get("/api/notifications/preferences/").data["preferences"]
        studies = next(item for item in prefs if item["category"] == "studies")
        self.assertFalse(studies["enabled"])
        self.assertIsNone(services.notify(self.user, "studies", "não deve criar"))

    def test_preferences_invalid(self):
        response = self.client.put(
            "/api/notifications/preferences/",
            {"preferences": [{"category": "nada", "enabled": True}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_requires_auth(self):
        anon = APIClient()
        self.assertEqual(anon.get("/api/notifications/").status_code, 403)


@override_settings(CHANNEL_LAYERS=MEMORY_CHANNELS)
class NotificationConsumerTests(TestCase):
    async def test_anonymous_connection_rejected(self):
        communicator = WebsocketCommunicator(application, "/ws/notifications/")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_authenticated_receives_unread_and_realtime(self):
        user = await database_sync_to_async(get_user_model().objects.create_user)(
            username="ws_aluno", password="safe-test-pass"
        )
        token = AccessToken.for_user(user)
        communicator = WebsocketCommunicator(
            application,
            "/ws/notifications/",
            headers=[(b"cookie", f"access={str(token)}".encode())],
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        first = await communicator.receive_json_from()
        self.assertEqual(first["type"], "unread_count")
        self.assertEqual(first["unread"], 0)

        await database_sync_to_async(services.notify)(user, "studies", "Hora de estudar", link="/study")

        notification_msg = await communicator.receive_json_from()
        self.assertEqual(notification_msg["type"], "notification")
        self.assertEqual(notification_msg["payload"]["title"], "Hora de estudar")

        count_msg = await communicator.receive_json_from()
        self.assertEqual(count_msg["type"], "unread_count")
        self.assertEqual(count_msg["unread"], 1)
        await communicator.disconnect()