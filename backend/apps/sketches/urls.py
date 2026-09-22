from django.urls import include, path
from rest_framework.routers import DefaultRouter
from apps.sketches.views import SketchViewSet

router = DefaultRouter()
router.register(r"sketches", SketchViewSet, basename="sketches")

urlpatterns = [
    path("", include(router.urls)),
]
