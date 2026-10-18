from django.contrib.auth import get_user_model

from django.db import transaction
from django.db.models import Count, Q
from apps.billing.models import Plan
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.backoffice.audit import log as audit_log
from apps.backoffice.permissions import Administrator, EditorialAccess, CampaignAuthor, has_role

from .models import AdminNotification, NotificationRecipient
from .serializers import AdminNotificationInputSerializer
from .delivery import enqueue_materialization

User = get_user_model()


def _serialize(item):
    recipients = item.recipients.all()
    counts = {state: 0 for state in NotificationRecipient.State.values}
    for row in recipients.values("state").annotate(total=Count("id")):
        counts[row["state"]] = row["total"]
    return {
        "id": item.id, "title": item.title, "summary": item.summary, "body": item.body,
        "priority": item.priority, "status": item.status, "scope": item.scope, "segment_plan_slug": item.segment_plan_slug, "segment_subscription_status": item.segment_subscription_status,
        "image_url": item.image_url, "video_url": item.video_url, "links": item.links,
        "starts_at": item.starts_at, "ends_at": item.ends_at,
        "postpone_hours": item.postpone_hours, "max_postpones": item.max_postpones,
        "selected_user_ids": list(recipients.values_list("user_id", flat=True)) if item.scope == AdminNotification.Scope.SELECTED else [],
        "metrics": {"total": recipients.count(), **counts},
        "created_at": item.created_at, "updated_at": item.updated_at, "published_at": item.published_at, "recipients_materialized_at": item.recipients_materialized_at, "closure_reason": item.closure_reason,
    }


def _apply(item, data, actor):
    editable = ("title", "summary", "body", "priority", "scope", "segment_plan_slug", "segment_subscription_status", "image_url", "video_url", "links", "starts_at", "ends_at", "postpone_hours", "max_postpones")
    for field in editable:
        if field in data:
            setattr(item, field, data[field])
    item.updated_by = actor
    item.save()
    if item.scope != AdminNotification.Scope.SELECTED:
        item.recipients.all().delete()
    elif "selected_user_ids" in data:
        ids = set(data["selected_user_ids"])
        item.recipients.exclude(user_id__in=ids).delete()
        existing = set(item.recipients.values_list("user_id", flat=True))
        NotificationRecipient.objects.bulk_create([
            NotificationRecipient(notification=item, user_id=user_id, source="selected")
            for user_id in ids - existing
        ])


@api_view(["GET", "POST"])
@permission_classes([EditorialAccess])
def admin_notifications(request):
    if request.method == "GET":
        items = AdminNotification.objects.all()
        overview = items.aggregate(total=Count("id"), **{value: Count("id", filter=Q(status=value)) for value in AdminNotification.Status.values})
        for key in ("status", "priority", "scope"):
            if value := request.query_params.get(key): items = items.filter(**{key: "all" if key == "scope" and value == "all-users" else value})
        if search := request.query_params.get("search", "").strip():
            items = items.filter(Q(title__icontains=search) | Q(summary__icontains=search))
        orderings = {"recent": ("-updated_at", "-pk"), "name": ("title", "pk"), "created": ("-created_at", "-pk")}
        items = items.order_by(*orderings.get(request.query_params.get("ordering"), orderings["recent"]))
        page, limit = _pagination(request)
        total = items.count()
        page = min(page, max(1, (total + limit - 1) // limit))
        return Response({"results": [_serialize(item) for item in items[(page - 1) * limit:page * limit]], "total": total, "count": total,
                         "page": page, "limit": limit, "overview": overview, "permissions": {"can_edit": has_role(request.user, "admin", "editor"),
                         "can_publish": has_role(request.user, "admin"), "can_track": has_role(request.user, "admin", "editor")}})
    serializer = AdminNotificationInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        item = AdminNotification.objects.create(created_by=request.user, updated_by=request.user)
        _apply(item, serializer.validated_data, request.user)
    audit_log(request, action="notification.created", resource_type="admin_notification", resource_id=item.id, after=_serialize(item))
    return Response(_serialize(item), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([EditorialAccess])
@transaction.atomic
def admin_notification_detail(request, pk):
    item = AdminNotification.objects.select_for_update().filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.status not in {AdminNotification.Status.DRAFT, AdminNotification.Status.SCHEDULED}:
        return Response({"detail": "Apenas rascunhos e avisos agendados podem ser editados."}, status=status.HTTP_400_BAD_REQUEST)
    serializer = AdminNotificationInputSerializer(data=request.data, context={"existing": item})
    serializer.is_valid(raise_exception=True)
    before = _serialize(item)
    with transaction.atomic():
        _apply(item, serializer.validated_data, request.user)
    audit_log(request, action="notification.updated", resource_type="admin_notification", resource_id=item.id, before=before, after=_serialize(item))
    return Response(_serialize(item))


@api_view(["POST"])
@permission_classes([Administrator])
@transaction.atomic
def admin_notification_publish(request, pk):
    item = AdminNotification.objects.select_for_update().filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.status == AdminNotification.Status.PUBLISHED:
        return Response(_serialize(item))
    if item.status not in {AdminNotification.Status.DRAFT, AdminNotification.Status.SCHEDULED}:
        return Response({"detail": "Avisos encerrados ou arquivados não podem ser republicados."}, status=status.HTTP_409_CONFLICT)
    now = timezone.now()
    if item.ends_at and item.ends_at <= now:
        return Response({"detail": "O período de exibição já terminou."}, status=status.HTTP_400_BAD_REQUEST)
    if item.scope == AdminNotification.Scope.SELECTED and (not item.recipients.exists() or item.recipients.filter(user__is_active=False).exists()):
        return Response({"detail": "Selecione destinatários ativos antes de publicar."}, status=status.HTTP_400_BAD_REQUEST)
    scheduled = bool(item.starts_at and item.starts_at > now)
    item.status = AdminNotification.Status.SCHEDULED if scheduled else AdminNotification.Status.PUBLISHED
    item.updated_by = request.user
    if not scheduled:
        item.published_at = now
    item.save(update_fields=["status", "published_at", "updated_by", "updated_at"])
    if not scheduled and item.scope in {AdminNotification.Scope.ALL, AdminNotification.Scope.SEGMENT}:
        enqueue_materialization(item.pk)
    audit_log(request, action="notification.scheduled" if scheduled else "notification.published", resource_type="admin_notification", resource_id=item.id, after=_serialize(item))
    return Response(_serialize(item))


@api_view(["POST"])
@permission_classes([Administrator])
@transaction.atomic
def admin_notification_close(request, pk):
    item = AdminNotification.objects.select_for_update().filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.status not in {AdminNotification.Status.PUBLISHED, AdminNotification.Status.SCHEDULED, AdminNotification.Status.CLOSED}:
        return Response({"detail": "Somente avisos publicados ou agendados podem ser encerrados."}, status=status.HTTP_409_CONFLICT)
    reason = str(request.data.get("reason", "")).strip()
    if item.priority == AdminNotification.Priority.REQUIRED and not reason:
        return Response({"reason": "Informe a justificativa para encerrar um aviso obrigatório."}, status=status.HTTP_400_BAD_REQUEST)
    if item.status != AdminNotification.Status.CLOSED:
        item.status = AdminNotification.Status.CLOSED
        item.closure_reason = reason
        item.updated_by = request.user
        item.save(update_fields=["status", "closure_reason", "updated_by", "updated_at"])
    audit_log(request, action="notification.closed", resource_type="admin_notification", resource_id=item.id, after=_serialize(item), reason=reason)
    return Response(_serialize(item))


@api_view(["POST"])
@permission_classes([Administrator])
@transaction.atomic
def admin_notification_archive(request, pk):
    item = AdminNotification.objects.select_for_update().filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.status == AdminNotification.Status.PUBLISHED:
        return Response({"detail": "Encerre o aviso antes de arquivar."}, status=status.HTTP_409_CONFLICT)
    item.status = AdminNotification.Status.ARCHIVED
    item.updated_by = request.user
    item.save(update_fields=["status", "updated_by", "updated_at"])
    audit_log(request, action="notification.archived", resource_type="admin_notification", resource_id=item.id, after=_serialize(item))
    return Response(_serialize(item))


def _pagination(request):
    try:
        page = max(1, int(request.query_params.get("page", 1)))
        limit = min(100, max(1, int(request.query_params.get("page_size", request.query_params.get("limit", 50)))))
    except (ValueError, TypeError):
        page, limit = 1, 50
    return page, limit


@api_view(["GET"])
@permission_classes([CampaignAuthor])
def campaign_options(request):
    """Minimal paginated lookup, without user-management records."""
    users = User.objects.filter(is_active=True)
    search = request.query_params.get("search", "").strip()
    if search:
        users = users.filter(Q(username__icontains=search) | Q(email__icontains=search))
    if plan := request.query_params.get("plan"):
        users = users.filter(subscription__plan__slug=plan)
    if subscription_status := request.query_params.get("subscription_status"):
        users = users.filter(subscription__status=subscription_status)
    page, limit = _pagination(request)
    return Response({
        "results": list(users.order_by("username", "pk").values("id", "username", "email")[(page - 1) * limit:page * limit]),
        "total": users.count(), "page": page, "limit": limit,
        "plans": list(Plan.objects.filter(is_active=True).order_by("name").values("slug", "name")),
    })


@api_view(["GET"])
@permission_classes([CampaignAuthor])
def admin_notification_recipients(request, pk):
    item = AdminNotification.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    recipients = item.recipients.select_related("user")
    if state := request.query_params.get("state"):
        if state not in NotificationRecipient.State.values:
            return Response({"state": "Estado inválido."}, status=status.HTTP_400_BAD_REQUEST)
        recipients = recipients.filter(state=state)
    if search := request.query_params.get("search", "").strip():
        recipients = recipients.filter(Q(user__username__icontains=search) | Q(user__email__icontains=search))
    page, limit = _pagination(request)
    rows = recipients.order_by("user__username", "pk")[(page - 1) * limit:page * limit]
    return Response({"total": recipients.count(), "page": page, "limit": limit, "results": [{
        "id": row.pk, "user_id": row.user_id, "username": row.user.username, "email": row.user.email,
        "state": row.state, "source": row.source, "first_shown_at": row.first_shown_at,
        "confirmed_at": row.confirmed_at, "next_reminder_at": row.next_reminder_at,
        "postpone_count": row.postpone_count,
    } for row in rows]})
