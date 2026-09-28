from django.contrib import admin

from .models import AdminNotification, Notification, NotificationPreference, NotificationRecipient


@admin.register(AdminNotification)
class AdminNotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "priority", "scope", "starts_at", "ends_at")
    list_filter = ("status", "priority", "scope")
    search_fields = ("title", "summary")
    readonly_fields = ("created_at", "updated_at", "published_at")


@admin.register(NotificationRecipient)
class NotificationRecipientAdmin(admin.ModelAdmin):
    list_display = ("notification", "user", "state", "postpone_count", "confirmed_at")
    list_filter = ("state", "source")
    search_fields = ("notification__title", "user__username", "user__email")


admin.site.register(Notification)
admin.site.register(NotificationPreference)
