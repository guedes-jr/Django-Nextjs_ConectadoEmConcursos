from django.urls import path
from . import views

urlpatterns = [
    path("articles/", views.articles_list, name="articles-list"),
    path("articles/<slug:slug>/", views.articles_detail, name="articles-detail"),
    path("concursos/<int:pk>/resources/<int:resource_id>/file/", views.resource_file, name="concurso-resource-file"),
    path("concursos/<int:pk>/", views.concurso_detail, name="concurso-detail"),
    path("concursos/", views.concursos_list, name="concursos-list"),
    path("news/", views.news_list, name="news-list"),
    path("news/<slug:slug>/", views.news_detail, name="news-detail"),
]