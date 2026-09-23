from django.urls import path
from . import views

urlpatterns = [
    path("workspace/notebooks/", views.notebooks),
    path("workspace/notebooks/<int:item_id>/", views.notebook_detail),
    path("workspace/notebooks/<int:item_id>/questions/", views.notebook_questions),
    path("workspace/flashcards/", views.flashcards),
    path("workspace/flashcards/<int:item_id>/", views.flashcard_detail),
    path("workspace/notes/", views.notes),
    path("workspace/community/", views.community),
    path("workspace/community/<int:item_id>/", views.community_detail),
    path("workspace/ranking/", views.ranking),
    path("workspace/people/", views.people),
    path("workspace/simulations/", views.simulations),
    path("workspace/submissions/", views.submissions),
]
