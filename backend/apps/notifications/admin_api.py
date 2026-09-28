from django.contrib.auth import get_user_model
from urllib.parse import urlparse

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.backoffice.audit import log as audit_log

from .models import AdminNotification, NotificationRecipient

User = get_user_model()


def _serialize(item):
    recipients = item.recipients.all()
    counts = {state: 0 for state in NotificationRecipient.State.values}
    for row in recipients.values("state").annotate(total=__import__("django.db.models", fromlist=["Count"]).Count("id")):
        counts[row["state"]] = row["total"]
    return {
        "id": item.id, "title": item.title, "summary": item.summary, "body": item.body,
        "priority": item.priority, "status": item.status, "scope": item.scope, "segment_plan_slug": item.segment_plan_slug, "segment_subscription_status": item.segment_subscription_status,
        "image_url": item.image_url, "video_url": item.video_url, "links": item.links,
        "starts_at": item.starts_at, "ends_at": item.ends_at,
        "postpone_hours": item.postpone_hours, "max_postpones": item.max_postpones,
        "selected_user_ids": list(recipients.values_list("user_id", flat=True)),
        "metrics": {"total": recipients.count(), **counts},
        "created_at": item.created_at, "updated_at": item.updated_at, "published_at": item.published_at, "closure_reason": item.closure_reason,
    }


def _valid_http_url(value):
    parsed = urlparse(str(value))
    return parsed.scheme in {"https", "http"} and bool(parsed.netloc)


def _as_datetime(value, fallback=None):
    if value in (None, ""):
        return None
    if hasattr(value, "tzinfo"):
        return value
    parsed = parse_datetime(str(value))
    if parsed and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed or fallback


def _validate(data, existing=None):
    errors = {}
    title = data.get("title", getattr(existing, "title", ""))
    body = data.get("body", getattr(existing, "body", ""))
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Informe um título."
    if len(str(title)) > 160:
        errors["title"] = "O título pode ter no máximo 160 caracteres."
    if "<" in str(body) or ">" in str(body):
        errors["body"] = "Use texto simples; HTML e scripts não são permitidos."
    scope = data.get("scope", getattr(existing, "scope", AdminNotification.Scope.SELECTED))
    if scope not in AdminNotification.Scope.values:
        errors["scope"] = "Escopo inválido."
    if scope == AdminNotification.Scope.SEGMENT and not (data.get("segment_plan_slug") or data.get("segment_subscription_status")):
        errors["scope"] = "Selecione um plano ou status de assinatura para o segmento."
    if scope == AdminNotification.Scope.SELECTED and "selected_user_ids" in data:
        ids = data["selected_user_ids"]
        if not isinstance(ids, list) or not ids:
            errors["selected_user_ids"] = "Selecione ao menos um usuário ativo."
        elif User.objects.filter(id__in=ids, is_active=True).count() != len(set(ids)):
            errors["selected_user_ids"] = "Há usuários inválidos ou inativos na seleção."
    image_url = data.get("image_url", getattr(existing, "image_url", ""))
    video_url = data.get("video_url", getattr(existing, "video_url", ""))
    if image_url and not _valid_http_url(image_url):
        errors["image_url"] = "Use uma URL HTTP(S) válida para a imagem."
    if video_url:
        host = urlparse(str(video_url)).hostname or ""
        if not _valid_http_url(video_url) or not host.endswith(("youtube.com", "youtu.be", "vimeo.com")):
            errors["video_url"] = "Use um vídeo hospedado em YouTube ou Vimeo."
    links = data.get("links", getattr(existing, "links", []))
    if not isinstance(links, list) or any(not isinstance(link, dict) or not str(link.get("label", "")).strip() or not _valid_http_url(link.get("url", "")) for link in links):
        errors["links"] = "Links devem conter texto acessível e URL HTTP(S) válida."
    starts_at = _as_datetime(data.get("starts_at", getattr(existing, "starts_at", None)))
    ends_at = _as_datetime(data.get("ends_at", getattr(existing, "ends_at", None)))
    if data.get("starts_at") not in (None, "") and not starts_at:
        errors["starts_at"] = "Informe uma data de início válida."
    if data.get("ends_at") not in (None, "") and not ends_at:
        errors["ends_at"] = "Informe uma data de término válida."
    if starts_at and ends_at and ends_at <= starts_at:
        errors["ends_at"] = "O término deve ser posterior ao início."
    return errors

def _apply(item, data, actor):
    editable = ("title", "summary", "body", "priority", "scope", "segment_plan_slug", "segment_subscription_status", "image_url", "video_url", "links", "starts_at", "ends_at", "postpone_hours", "max_postpones")
    for field in editable:
        if field in data:
            setattr(item, field, data[field])
    item.updated_by = actor
    item.save()
    if "selected_user_ids" in data:
        ids = set(data["selected_user_ids"])
        item.recipients.exclude(user_id__in=ids).delete()
        existing = set(item.recipients.values_list("user_id", flat=True))
        NotificationRecipient.objects.bulk_create([
            NotificationRecipient(notification=item, user_id=user_id, source="selected")
            for user_id in ids - existing
        ])


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def admin_notifications(request):
    if request.method == "GET":
        items = AdminNotification.objects.prefetch_related("recipients").all()
        status_filter = request.query_params.get("status")
        if status_filter:
            items = items.filter(status=status_filter)
        return Response({"results": [_serialize(item) for item in items[:100]]})
    errors = _validate(request.data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        item = AdminNotification.objects.create(created_by=request.user, updated_by=request.user)
        _apply(item, request.data, request.user)
    audit_log(request, action="notification.created", resource_type="admin_notification", resource_id=item.id, after=_serialize(item))
    return Response(_serialize(item), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def admin_notification_detail(request, pk):
    item = AdminNotification.objects.prefetch_related("recipients").filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.status not in {AdminNotification.Status.DRAFT, AdminNotification.Status.SCHEDULED}:
        return Response({"detail": "Apenas rascunhos e avisos agendados podem ser editados."}, status=status.HTTP_400_BAD_REQUEST)
    errors = _validate(request.data, item)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)
    before = _serialize(item)
    with transaction.atomic():
        _apply(item, request.data, request.user)
    audit_log(request, action="notification.updated", resource_type="admin_notification", resource_id=item.id, before=before, after=_serialize(item))
    return Response(_serialize(item))


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_notification_publish(request, pk):
    item = AdminNotification.objects.prefetch_related("recipients").filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    if item.starts_at and item.starts_at > timezone.now():
        item.status = AdminNotification.Status.SCHEDULED
        item.updated_by = request.user
        item.save(update_fields=["status", "updated_by", "updated_at"])
        audit_log(request, action="notification.scheduled", resource_type="admin_notification", resource_id=item.id, after=_serialize(item))
        return Response(_serialize(item))
    if item.scope != AdminNotification.Scope.ALL and not item.recipients.exists():
        return Response({"detail": "Selecione destinatários ativos antes de publicar."}, status=status.HTTP_400_BAD_REQUEST)
    if item.status != AdminNotification.Status.PUBLISHED:
        item.status = AdminNotification.Status.PUBLISHED
        item.published_at = timezone.now()
        item.updated_by = request.user
        item.save(update_fields=["status", "published_at", "updated_by", "updated_at"])
        if item.scope in {AdminNotification.Scope.ALL, AdminNotification.Scope.SEGMENT}:
            from django_q.tasks import async_task
            async_task("apps.notifications.delivery.materialize_recipients", item.id)
    audit_log(request, action="notification.published", resource_type="admin_notification", resource_id=item.id, after=_serialize(item))
    return Response(_serialize(item))


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_notification_close(request, pk):
    item = AdminNotification.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
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
@permission_classes([IsAdminUser])
def admin_notification_archive(request, pk):
    item = AdminNotification.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "Aviso não encontrado."}, status=status.HTTP_404_NOT_FOUND)
    item.status = AdminNotification.Status.ARCHIVED
    item.updated_by = request.user
    item.save(update_fields=["status", "updated_by", "updated_at"])
    audit_log(request, action="notification.archived", resource_type="admin_notification", resource_id=item.id, after=_serialize(item))
    return Response(_serialize(item))
