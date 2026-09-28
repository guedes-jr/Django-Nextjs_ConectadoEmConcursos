from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.billing.models import Subscription

from .models import AdminNotification, NotificationRecipient


def materialize_recipients(notification_id):
    """Tarefa django-q: materializa destinatários ativos em lotes, sem requisição web longa."""
    notification = AdminNotification.objects.filter(pk=notification_id, scope__in=[AdminNotification.Scope.ALL, AdminNotification.Scope.SEGMENT]).first()
    if not notification or notification.status != AdminNotification.Status.PUBLISHED:
        return 0
    users = get_user_model().objects.filter(is_active=True)
    if notification.scope == AdminNotification.Scope.SEGMENT:
        subscriptions = Subscription.objects.filter(user__is_active=True)
        if notification.segment_plan_slug:
            subscriptions = subscriptions.filter(plan__slug=notification.segment_plan_slug)
        if notification.segment_subscription_status:
            subscriptions = subscriptions.filter(status=notification.segment_subscription_status)
        users = users.filter(id__in=subscriptions.values("user_id"))
    user_ids = users.values_list("id", flat=True)
    created = 0
    batch = []
    for user_id in user_ids.iterator(chunk_size=1000):
        batch.append(NotificationRecipient(notification=notification, user_id=user_id, source=notification.scope))
        if len(batch) == 500:
            NotificationRecipient.objects.bulk_create(batch, ignore_conflicts=True)
            created += len(batch); batch = []
    if batch:
        NotificationRecipient.objects.bulk_create(batch, ignore_conflicts=True); created += len(batch)
    return created


def publish_due():
    """Pode ser chamado pelo agendador/cron para publicar avisos vencidos."""
    now = timezone.now(); total = 0
    with transaction.atomic():
        items = list(AdminNotification.objects.select_for_update().filter(status=AdminNotification.Status.SCHEDULED, starts_at__lte=now))
        for item in items:
            item.status = AdminNotification.Status.PUBLISHED; item.published_at = now
            item.save(update_fields=["status", "published_at", "updated_at"]); total += 1
            if item.scope == AdminNotification.Scope.ALL:
                from django_q.tasks import async_task
                async_task("apps.notifications.delivery.materialize_recipients", item.id)
    return total
