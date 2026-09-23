from django.contrib import admin
from django.db.models import Count, Q

from apps.questions.models import Comment, ErrorReport, Exam, Favorite, Question, QuestionNote, QuestionReview, UserAnswer


class CommentStatusFilter(admin.SimpleListFilter):
    title = "gabarito comentado"
    parameter_name = "comment_status"

    def lookups(self, request, model_admin):
        return (("missing", "Sem comentário"), ("ready", "Com comentário"))

    def queryset(self, request, queryset):
        if self.value() == "missing":
            return queryset.filter(explanation="").order_by("-comment_requests_count", "-error_count", "id")
        if self.value() == "ready":
            return queryset.exclude(explanation="")
        return queryset


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "discipline", "banca", "year", "exam", "has_comment", "comment_requests", "error_count", "is_active")
    list_filter = (CommentStatusFilter, "is_active", "discipline", "banca", "year")
    search_fields = ("statement", "explanation")
    autocomplete_fields = ("exam",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            error_count=Count("answers", filter=Q(answers__is_correct=False), distinct=True),
            comment_requests_count=Count(
                "error_reports",
                filter=Q(error_reports__description="Solicitação de gabarito comentado."),
                distinct=True,
            ),
        )

    @admin.display(boolean=True, description="Comentada")
    def has_comment(self, obj):
        return bool(obj.explanation.strip())

    @admin.display(ordering="error_count", description="Erros")
    def error_count(self, obj):
        return obj.error_count

    @admin.display(ordering="comment_requests_count", description="Pedidos de comentário")
    def comment_requests(self, obj):
        return obj.comment_requests_count


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ("title", "banca", "institution", "role", "year", "is_published")
    list_filter = ("is_published", "banca", "year")
    search_fields = ("title", "institution", "role")
admin.site.register(UserAnswer)
admin.site.register(QuestionReview)
admin.site.register(Favorite)
admin.site.register(QuestionNote)
admin.site.register(Comment)
admin.site.register(ErrorReport)
