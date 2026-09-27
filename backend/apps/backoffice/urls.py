from django.urls import path

from . import question_content_api, views

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
    path("content/proofs/convert/", question_content_api.proofs_convert, name="proofs-convert"),
    path("content/questions/", views.questions_admin, name="questions"),
    path("content/sources/", question_content_api.sources, name="question-sources"),
    path("content/sources/<slug:slug>/filters/", question_content_api.source_filters, name="question-source-filters"),
    path("content/question-search/", question_content_api.question_search, name="question-search"),
    path("content/question-search/<int:pk>/", question_content_api.question_search_detail, name="question-search-detail"),
    path("content/question-search/<int:pk>/continue/", question_content_api.question_search_continue, name="question-search-continue"),
    path("content/question-search/<int:pk>/rerun/", question_content_api.question_search_rerun, name="question-search-rerun"),
    path("content/question-search/<int:pk>/import-skipped/", question_content_api.question_search_import_skipped, name="question-search-import-skipped"),
    path("content/questions/queue/", question_content_api.questions_queue, name="questions-queue"),
    path("content/questions/queue/next/", question_content_api.questions_queue_next, name="questions-queue-next"),
    path("content/questions/rejection-reasons/", question_content_api.rejection_reasons, name="questions-rejection-reasons"),
    path("content/questions/draft/", question_content_api.questions_draft, name="questions-draft"),
    path("content/questions/approve/", question_content_api.questions_approve, name="questions-approve"),
    path("content/questions/reject/", question_content_api.questions_reject, name="questions-reject"),
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