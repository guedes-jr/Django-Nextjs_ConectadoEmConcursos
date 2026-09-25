from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close()
            return
        self.group_name = f"notifications_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({
            "type": "unread_count",
            "unread": await _unread_count(self.scope["user"].id),
        })

    async def disconnect(self, code):
        group_name = getattr(self, "group_name", None)
        if group_name is not None and self.channel_layer is not None:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def notify(self, event):
        await self.send_json({"type": "notification", "payload": event["payload"]})

    async def unread_count(self, event):
        await self.send_json({"type": "unread_count", "unread": event["unread"]})


@database_sync_to_async
def _unread_count(user_id):
    from .models import Notification

    return Notification.objects.filter(user_id=user_id, is_read=False).count()