"""
ASGI config for config project.

Expõe o app ASGI com HTTP (Django) + WebSocket (channels), roteando
as conexões reais de notificações para o consumidor de apps.notifications.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from apps.notifications import routing  # noqa: E402
from apps.notifications.middleware import JwtAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JwtAuthMiddleware(URLRouter(routing.websocket_urlpatterns)),
    }
)