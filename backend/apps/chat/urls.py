from rest_framework.routers import DefaultRouter
from apps.chat.views import ConversationViewSet, StudyMaterialViewSet

router = DefaultRouter()
router.register("conversations", ConversationViewSet, basename="conversations")
router.register("study-materials", StudyMaterialViewSet, basename="study-materials")
urlpatterns = router.urls
