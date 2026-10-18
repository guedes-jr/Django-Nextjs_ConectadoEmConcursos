from unittest.mock import patch

from django.db import DatabaseError
from django.test import TestCase, override_settings

from apps.core.readiness import check_readiness


class ReadinessTests(TestCase):
    def test_liveness_and_isolated_readiness_are_uncached_and_anonymous(self):
        self.assertEqual(self.client.get("/api/health/").json(), {"status": "ok"})
        response = self.client.get("/api/ready/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ready"})
        self.assertEqual(response["Cache-Control"], "no-store")

    @patch("apps.core.readiness.connection")
    def test_database_failure_is_sanitized(self, database):
        database.cursor.side_effect = DatabaseError("password=secret host=internal")
        response = self.client.get("/api/ready/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertNotIn("secret", response.content.decode())

    @override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels_redis.core.RedisChannelLayer"}},
                       REDIS_URL="redis://channels.test/0", Q_CLUSTER={"redis": {"host": "queue.test", "db": 1}})
    @patch("apps.core.readiness.Redis")
    def test_both_configured_redis_dependencies_are_probed_with_timeouts(self, redis):
        check_readiness()
        redis.from_url.assert_called_once_with("redis://channels.test/0", socket_connect_timeout=2, socket_timeout=2)
        redis.assert_called_once_with(host="queue.test", db=1, socket_connect_timeout=2, socket_timeout=2)
        redis.from_url.return_value.__enter__.return_value.ping.assert_called_once()
        redis.return_value.__enter__.return_value.ping.assert_called_once()

    @override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels_redis.core.RedisChannelLayer"}})
    @patch("apps.core.readiness.Redis")
    def test_redis_failure_returns_503_without_external_provider_calls(self, redis):
        redis.from_url.side_effect = ConnectionError("redis://password@internal")
        with patch("requests.post", side_effect=AssertionError("No external calls")):
            response = self.client.get("/api/ready/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})

    def test_probe_does_not_accept_write_methods(self):
        self.assertEqual(self.client.post("/api/ready/").status_code, 405)
