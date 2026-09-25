from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from .models import Notification, NotificationPreference


def serialize(notification):
    return {
        "id": notification.pk,
        "category": notification.category,
        "title": notification.title,
        "body": notification.body,
        "link": notification.link,
        "actor": notification.actor_id,
        "metadata": notification.metadata,
        "is_read": notification.is_read,
        "read_on": notification.read_on.isoformat() if notification.read_on else None,
        "created_at": notification.created_at.isoformat(),
    }


def notify(user, category, title, body="", link=None, actor=None, metadata=None):
    """Cria a notificação in-app e a entrega em tempo real ao usuário (se on-line)."""
    disabled = NotificationPreference.objects.filter(user=user, category=category, enabled=False).exists()
    if disabled:
        return None
    notification = Notification.objects.create(
        user=user,
        category=category,
        title=title,
        body=body,
        link=link or "",
        actor=actor,
        metadata=metadata or {},
    )
    _push(notification)
    return notification


def unread_count(user):
    return Notification.objects.filter(user=user, is_read=False).count()


def mark_read(user, ids):
    return Notification.objects.filter(user=user, is_read=False, pk__in=ids).update(
        is_read=True, read_on=timezone.now()
    )


def mark_read_all(user):
    return Notification.objects.filter(user=user, is_read=False).update(
        is_read=True, read_on=timezone.now()
    )


def _push(notification):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    group = f"notifications_{notification.user_id}"
    try:
        async_to_sync(channel_layer.group_send)(
            group, {"type": "notify", "payload": serialize(notification)}
        )
        async_to_sync(channel_layer.group_send)(
            group, {"type": "unread_count", "unread": Notification.objects.filter(user_id=notification.user_id, is_read=False).count()}
        )
    except Exception:
        # Canal indisponível (ex.: Redis fora do ar): a notificação persiste no banco
        # e o sino a entrega via polling/fallback.
        pass