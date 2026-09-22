from django.contrib import admin

from apps.questions.models import Comment, ErrorReport, Exam, Favorite, Question, QuestionNote, UserAnswer


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "discipline", "banca", "year", "exam", "is_active")
    list_filter = ("is_active", "discipline", "banca", "year")
    search_fields = ("statement", "explanation")
    autocomplete_fields = ("exam",)


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ("title", "banca", "institution", "role", "year", "is_published")
    list_filter = ("is_published", "banca", "year")
    search_fields = ("title", "institution", "role")
admin.site.register(UserAnswer)
admin.site.register(Favorite)
admin.site.register(QuestionNote)
admin.site.register(Comment)
admin.site.register(ErrorReport)
