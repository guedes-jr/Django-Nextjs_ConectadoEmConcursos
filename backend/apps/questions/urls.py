from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.questions.views import ExamViewSet, QuestionViewSet, SimulationTemplateViewSet, comment_detail, statistics


router = DefaultRouter()
router.register("questions", QuestionViewSet, basename="questions")
router.register("exams", ExamViewSet, basename="exams")
router.register("simulation-templates", SimulationTemplateViewSet, basename="simulation-templates")

urlpatterns = router.urls + [
    path("comments/<int:comment_id>/", comment_detail, name="comment-detail"),
    path("statistics/", statistics, name="statistics"),
]
