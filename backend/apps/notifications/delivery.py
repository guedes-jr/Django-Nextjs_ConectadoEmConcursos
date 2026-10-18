from functools import partial

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.billing.models import Subscription
from apps.backoffice.audit import log as audit_log, audited_job
from .models import AdminNotification, NotificationRecipient


def enqueue_materialization(notification_id):
    from django_q.tasks import async_task
    transaction.on_commit(partial(async_task, "apps.notifications.delivery.materialize_recipients", notification_id))


@audited_job("materialize_recipients")
@transaction.atomic
def materialize_recipients(notification_id):
    """Freeze an active audience once; retries never add new subscribers."""
    notification = AdminNotification.objects.select_for_update().filter(
        pk=notification_id, scope__in=[AdminNotification.Scope.ALL, AdminNotification.Scope.SEGMENT],
    ).first()
    if not notification or notification.status != AdminNotification.Status.PUBLISHED or notification.recipients_materialized_at:
        return 0
    users = get_user_model().objects.filter(is_active=True)
    if notification.scope == AdminNotification.Scope.SEGMENT:
        subscriptions = Subscription.objects.filter(user__is_active=True)
        if notification.segment_plan_slug:
            subscriptions = subscriptions.filter(plan__slug=notification.segment_plan_slug)
        if notification.segment_subscription_status:
            subscriptions = subscriptions.filter(status=notification.segment_subscription_status)
        users = users.filter(id__in=subscriptions.values("user_id"))
    users = users.exclude(id__in=notification.recipients.values("user_id"))
    created = 0
    batch = []
    for user_id in users.values_list("id", flat=True).iterator(chunk_size=1000):
        batch.append(NotificationRecipient(notification=notification, user_id=user_id, source=notification.scope))
        if len(batch) == 500:
            NotificationRecipient.objects.bulk_create(batch, ignore_conflicts=True)
            created += len(batch)
            batch = []
    if batch:
        NotificationRecipient.objects.bulk_create(batch, ignore_conflicts=True)
        created += len(batch)
    notification.recipients_materialized_at = timezone.now()
    notification.save(update_fields=["recipients_materialized_at"])
    audit_log(action="notification.recipients_materialized", resource_type="admin_notification", resource_id=notification.pk,
              after={"created": created, "total": notification.recipients.count()},
              context={"origin": "job:materialize_recipients", "scope": notification.scope})
    return created


@audited_job("publish_due")
@transaction.atomic
def publish_due():
    """Publish due campaigns; enqueue broad and segmented audiences after commit."""
    now = timezone.now()
    items = AdminNotification.objects.select_for_update().filter(
        status=AdminNotification.Status.SCHEDULED, starts_at__lte=now,
    )
    total = 0
    for item in items:
        before = {"status": item.status}
        if item.ends_at and item.ends_at <= now:
            item.status = AdminNotification.Status.CLOSED
            item.save(update_fields=["status", "updated_at"])
            audit_log(action="notification.expired", resource_type="admin_notification", resource_id=item.pk, before=before,
                      after={"status": item.status}, reason="Período de exibição encerrado antes da publicação.", context={"origin": "job:publish_due"})
            continue
        item.status = AdminNotification.Status.PUBLISHED
        item.published_at = now
        item.save(update_fields=["status", "published_at", "updated_at"])
        audit_log(action="notification.published", resource_type="admin_notification", resource_id=item.pk, before=before,
                  after={"status": item.status, "published_at": item.published_at}, context={"origin": "job:publish_due"})
        total += 1
        if item.scope in {AdminNotification.Scope.ALL, AdminNotification.Scope.SEGMENT}:
            enqueue_materialization(item.pk)
    return total
