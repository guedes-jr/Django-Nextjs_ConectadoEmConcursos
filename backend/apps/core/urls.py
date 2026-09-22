from django.urls import path
from .views import health
from apps.core.api import change_password, csrf, me, password_reset_confirm, password_reset_request

urlpatterns = [
    path("health/", health),
    path("me/", me),
    path("csrf/", csrf),
    path("password/reset/", password_reset_request),
    path("password/reset/confirm/", password_reset_confirm),
    path("password/change/", change_password),
]
