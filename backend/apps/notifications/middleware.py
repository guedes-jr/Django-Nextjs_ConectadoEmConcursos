from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

JWT_COOKIE_NAME = "access"


def _read_cookie(headers, name):
    raw = dict(headers).get(b"cookie", b"")
    for chunk in raw.decode("latin-1").split(";"):
        chunk = chunk.strip()
        if "=" in chunk:
            key, _, value = chunk.partition("=")
            if key == name:
                return value
    return None


class JwtAuthMiddleware(BaseMiddleware):
    """Autentica o handshake WebSocket a partir do cookie JWT `access`.

    O dj-rest-auth marca o cookie como HttpOnly, mas o navegador o envia
    automaticamente no handshake, permitindo autenticar sem token na URL.
    """

    async def __call__(self, scope, receive, send):
        scope["user"] = AnonymousUser()
        token = _read_cookie(scope.get("headers") or [], JWT_COOKIE_NAME)
        if token:
            try:
                access = AccessToken(token)
                user = await self._get_user(access["user_id"])
                if user is not None:
                    scope["user"] = user
            except Exception:
                scope["user"] = AnonymousUser()
        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def _get_user(self, user_id):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.filter(pk=user_id, is_active=True).first()