from django.urls import path
from . import views

urlpatterns = [
    path("study-plan/", views.plan, name="study-plan"),
    path("study-plan/blocks/<int:block_id>/", views.block, name="study-block"),
    path("study-plan/blocks/<int:block_id>/sessions/", views.session, name="study-session"),
    path("study-plan/replan/", views.replan, name="study-replan"),
]
