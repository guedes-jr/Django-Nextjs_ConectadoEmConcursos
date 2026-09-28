from django.urls import path

from . import views

urlpatterns = [
    path("notifications/", views.notification_list, name="notifications-list"),
    path("notifications/unread-count/", views.unread_count, name="notifications-unread-count"),
    path("notifications/read/", views.mark_read, name="notifications-mark-read"),
    path("notifications/read-all/", views.mark_read_all, name="notifications-mark-read-all"),
    path("notifications/preferences/", views.preferences, name="notifications-preferences"),
    path("admin-notices/next/", views.next_admin_notification, name="admin-notice-next"),
    path("admin-notices/<int:pk>/confirm/", views.confirm_admin_notification, name="admin-notice-confirm"),
    path("admin-notices/<int:pk>/postpone/", views.postpone_admin_notification, name="admin-notice-postpone"),
]