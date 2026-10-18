"""Authorization shared by current and legacy backoffice endpoints."""
from django.conf import settings
from django.db.models import Q
from rest_framework.permissions import BasePermission, SAFE_METHODS

ROLE_GROUPS = {"admin": "Administrador", "editor": "Editor", "reviewer": "Revisor"}


def has_role(user, *roles):
    if not user or not user.is_authenticated or not user.is_active or not user.is_staff:
        return False
    return user.is_superuser or user.groups.filter(name__in=[ROLE_GROUPS[role] for role in roles]).exists()


class Administrator(BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, "admin")


class CampaignAuthor(BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, "admin", "editor")


class EditorialAccess(BasePermission):
    """All staff can read editorial records; only editors/admins can write."""
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            user = request.user
            return bool(user and user.is_authenticated and user.is_active and user.is_staff)
        return has_role(request.user, "admin", "editor")


class ReviewAccess(EditorialAccess):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return super().has_permission(request, view)
        return has_role(request.user, "admin", "reviewer")


class SuperuserAccess(BasePermission):
    def has_permission(self, request, view):
        return bool(has_role(request.user, "admin") and request.user.is_superuser)


def diagnostics_allowed(user):
    # ModelBackend grants superusers every permission implicitly. Require an
    # explicit user/group grant here so the additional diagnostic gate is real.
    if not (settings.DIAGNOSTICS_ENABLED and has_role(user, "admin") and user.is_superuser):
        return False
    from django.contrib.auth.models import Permission
    return Permission.objects.filter(
        content_type__app_label="backoffice", codename="access_diagnostics",
    ).filter(Q(user=user) | Q(group__user=user)).exists()
