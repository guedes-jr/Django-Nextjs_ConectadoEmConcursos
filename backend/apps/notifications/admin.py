from django.contrib import admin

from .models import Notification, NotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "category", "title", "is_read", "created_at")
    list_filter = ("category", "is_read")
    search_fields = ("title", "body", "user__username", "user__email")
    date_hierarchy = "created_at"


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "category", "enabled")
    list_filter = ("enabled",)