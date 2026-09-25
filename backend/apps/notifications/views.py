from django.core.paginator import Paginator
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import services
from .models import Notification, NotificationCategory, NotificationPreference

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