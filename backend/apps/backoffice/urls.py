from django.urls import path

from . import views

app_name = "backoffice"

urlpatterns = [
    path("overview/", views.overview, name="overview"),
    path("users/", views.list_users, name="users"),
    path("users/<int:pk>/", views.update_user, name="user-detail"),
    path("users/<int:pk>/subscription/", views.assign_subscription, name="user-subscription"),
    path("subscriptions/", views.list_subscriptions, name="subscriptions"),
    path("subscriptions/<int:pk>/", views.update_subscription, name="subscription-detail"),
    path("plans/", views.plans, name="plans"),
    path("plans/<int:pk>/", views.plan_detail, name="plan-detail"),
    path("content/proofs/", views.proofs, name="proofs"),
    path("content/questions/", views.questions_admin, name="questions"),
    path("content/news/", views.news_admin, name="news"),
    path("content/community/", views.community_admin, name="community"),
    path("content/concursos/", views.concursos_admin, name="concursos"),
    path("backups/", views.backups, name="backups"),
    path("backups/<path:name>/restore/", views.restore, name="restore"),
    path("chat/", views.chat_usage, name="chat"),
    path("staff/", views.staff, name="staff"),
    path("staff/<int:pk>/", views.staff_detail, name="staff-detail"),
    path("reports/study/", views.study_reports, name="study-reports"),
]