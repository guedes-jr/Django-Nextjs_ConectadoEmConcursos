from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponseRedirect
from urllib.parse import quote
from apps.core.api import upload_avatar

site_login = admin.site.login


def admin_login_via_portal(request, extra_context=None):
    if not request.user.is_authenticated:
        next_url = request.GET.get("next")
        target = f"{settings.FRONTEND_URL}/login"
        if next_url:
            target += f"?next={quote(next_url)}"
        return HttpResponseRedirect(target)
    return site_login(request, extra_context)


admin.site.login = admin_login_via_portal

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("allauth.urls")),

    # Authentication APIs
    path("api/auth/", include("dj_rest_auth.urls")),
    path("api/auth/registration/", include("dj_rest_auth.registration.urls")),

    # Core API
    path("api/", include("apps.core.urls")),

    # Sketches API
    path("api/", include("apps.sketches.urls")),

    # Questions API
    path("api/", include("apps.questions.urls")),
    path("api/", include("apps.studies.urls")),
    path("api/", include("apps.workspace.urls")),
    path("api/", include("apps.chat.urls")),
    path("api/", include("apps.billing.urls")),
    path("api/", include("apps.concursos.urls")),
    path("api/backoffice/", include("apps.backoffice.urls")),

    # Profile
    path("api/profile/avatar/", upload_avatar),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
