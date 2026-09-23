from django.contrib import admin
from .models import CommunityPost, ExamSubmission, Flashcard, Notebook, SimulationRun

admin.site.register(Notebook)
admin.site.register(Flashcard)
admin.site.register(CommunityPost)
admin.site.register(SimulationRun)
admin.site.register(ExamSubmission)
