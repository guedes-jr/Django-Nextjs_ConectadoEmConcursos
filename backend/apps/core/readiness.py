"""Dependency probes used by deployment, never external AI/mail/payment calls."""
from django.conf import settings
from django.db import connection
from redis import Redis


def check_readiness():
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        if cursor.fetchone() != (1,):
            raise RuntimeError("Database unavailable")
    layer = settings.CHANNEL_LAYERS.get("default", {})
    if layer.get("BACKEND") == "channels_redis.core.RedisChannelLayer":
        # This application configures a single Redis URL for Channels.
        with Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2) as client:
            if not client.ping():
                raise RuntimeError("Channels unavailable")
    queue = settings.Q_CLUSTER
    if not queue.get("sync") and not queue.get("orm"):
        with Redis(**queue.get("redis", {}), socket_connect_timeout=2, socket_timeout=2) as client:
            if not client.ping():
                raise RuntimeError("Queue unavailable")
