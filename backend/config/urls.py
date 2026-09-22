from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.core.api import upload_avatar

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
    path("api/", include("apps.chat.urls")),
    path("api/", include("apps.billing.urls")),

    # Profile
    path("api/profile/avatar/", upload_avatar),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
