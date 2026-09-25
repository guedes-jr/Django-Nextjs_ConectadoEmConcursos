from django.urls import path
from . import views

urlpatterns = [
    path("study-plans/", views.plans, name="study-plans-list"),
    path("study-plans/<int:plan_id>/", views.plan_detail, name="study-plan-detail"),
    path("study-plans/<int:plan_id>/blocks/<int:block_id>/", views.block, name="study-block"),
    path("study-plans/<int:plan_id>/blocks/<int:block_id>/sessions/", views.session, name="study-session"),
    path("study-plans/<int:plan_id>/replan/", views.replan, name="study-replan"),
    path("study-alerts/", views.alerts, name="study-alerts"),
    path("study-intervals/", views.intervals, name="study-intervals"),
]
