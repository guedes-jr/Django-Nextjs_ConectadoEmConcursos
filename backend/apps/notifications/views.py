from datetime import timedelta

from django.core.paginator import Paginator
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import services
from .models import AdminNotification, Notification, NotificationCategory, NotificationPreference, NotificationRecipient

PAGE_SIZE = 20


def _read_page(request):
    try:
        return max(1, int(request.GET.get("page", "1")))
    except (TypeError, ValueError):
        return 1


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_list(request):
    queryset = Notification.objects.filter(user=request.user)
    if request.GET.get("unread") in {"1", "true"}:
        queryset = queryset.filter(is_read=False)
    category = request.GET.get("category")
    if category:
        queryset = queryset.filter(category=category)
    page = Paginator(queryset, PAGE_SIZE).get_page(_read_page(request))
    return Response({
        "count": page.paginator.count,
        "next": page.has_next(),
        "previous": page.has_previous(),
        "results": [services.serialize(item) for item in page.object_list],
        "unread": services.unread_count(request.user),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count(request):
    return Response({"unread": services.unread_count(request.user)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read(request):
    ids = request.data.get("ids") or []
    try:
        ids = [int(item) for item in ids]
    except (TypeError, ValueError):
        return Response({"detail": "ids inválidos."}, status=status.HTTP_400_BAD_REQUEST)
    count = services.mark_read(request.user, ids)
    return Response({"read": count})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read_all(request):
    count = services.mark_read_all(request.user)
    return Response({"read": count})


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def preferences(request):
    if request.method == "PUT":
        payload = request.data.get("preferences")
        if not isinstance(payload, list):
            return Response(
                {"detail": "Envie preferences: uma lista de [{category, enabled}]."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        valid = {choice.value for choice in NotificationCategory}
        for item in payload:
            if not isinstance(item, dict) or item.get("category") not in valid or not isinstance(item.get("enabled"), bool):
                return Response(
                    {"detail": f"preferência inválida: {item}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            NotificationPreference.objects.update_or_create(
                user=request.user,
                category=item["category"],
                defaults={"enabled": item["enabled"]},
            )
    current = dict(NotificationPreference.objects.filter(user=request.user).values_list("category", "enabled"))
    results = [
        {"category": choice.value, "label": choice.label, "enabled": current.get(choice.value, True)}
        for choice in NotificationCategory
    ]
    return Response({"preferences": results})

def _admin_notice_payload(recipient):
    item = recipient.notification
    return {
        "id": item.id, "recipient_id": recipient.id, "title": item.title, "summary": item.summary, "body": item.body,
        "priority": item.priority, "image_url": item.image_url, "video_url": item.video_url, "links": item.links,
        "postpone_hours": item.postpone_hours, "max_postpones": item.max_postpones,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def next_admin_notification(request):
    now = timezone.now()
    recipient = NotificationRecipient.objects.select_related("notification").filter(
        user=request.user, notification__status=AdminNotification.Status.PUBLISHED,
    ).filter(Q(notification__starts_at__isnull=True) | Q(notification__starts_at__lte=now)).filter(
        Q(notification__ends_at__isnull=True) | Q(notification__ends_at__gt=now)
    ).filter(Q(state=NotificationRecipient.State.PENDING) | Q(state=NotificationRecipient.State.POSTPONED, next_reminder_at__lte=now)).order_by("notification__published_at", "id").first()
    if not recipient:
        return Response({"notification": None})
    if recipient.first_shown_at is None:
        recipient.first_shown_at = now
        recipient.save(update_fields=["first_shown_at"])
    return Response({"notification": _admin_notice_payload(recipient)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_admin_notification(request, pk):
    recipient = NotificationRecipient.objects.filter(pk=pk, user=request.user).first()
    if not recipient:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if recipient.state != NotificationRecipient.State.VIEWED:
        recipient.state = NotificationRecipient.State.VIEWED
        recipient.confirmed_at = timezone.now()
        recipient.save(update_fields=["state", "confirmed_at"])
    return Response({"detail": "Visualização confirmada."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def postpone_admin_notification(request, pk):
    recipient = NotificationRecipient.objects.select_related("notification").filter(pk=pk, user=request.user).first()
    if not recipient:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    item = recipient.notification
    if recipient.postpone_count >= item.max_postpones:
        return Response({"detail": "Este aviso atingiu o limite de adiamentos."}, status=status.HTTP_400_BAD_REQUEST)
    recipient.state = NotificationRecipient.State.POSTPONED
    recipient.postpone_count += 1
    recipient.next_reminder_at = timezone.now() + timedelta(hours=item.postpone_hours)
    recipient.save(update_fields=["state", "postpone_count", "next_reminder_at"])
    return Response({"next_reminder_at": recipient.next_reminder_at, "postpone_count": recipient.postpone_count})
