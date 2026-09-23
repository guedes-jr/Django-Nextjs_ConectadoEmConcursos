from django.urls import path
from . import views

urlpatterns = [
    path("concursos/", views.concursos_list, name="concursos-list"),
    path("news/", views.news_list, name="news-list"),
    path("news/<slug:slug>/", views.news_detail, name="news-detail"),
]