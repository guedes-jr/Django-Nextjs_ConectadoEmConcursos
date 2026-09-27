from django.contrib import admin, messages
from django.db.models import Count, Q

from apps.questions import moderation
from apps.questions.models import (
    Comment,
    ErrorReport,
    Exam,
    Favorite,
    Question,
    QuestionNote,
    QuestionReview,
    QuestionSource,
    QuestionStemToken,
    SearchRun,
    UserAnswer,
)


class CommentStatusFilter(admin.SimpleListFilter):
    title = "gabarito comentado"
    parameter_name = "comment_status"

    def lookups(self, request, model_admin):
        return (("missing", "Sem comentário"), ("ready", "Com comentário"))

    def queryset(self, request, queryset):
        if self.value() == "missing":
            return queryset.filter(explanation="").order_by(
                "-comment_requests_count", "-error_count", "id"
            )
        if self.value() == "ready":
            return queryset.exclude(explanation="")
        return queryset


def _approve_selected(modeladmin, request, queryset):
    """Aprova em lote — só questões com explicação já gravada (≥ 120 chars)."""
    ok = skipped = 0
    for question in queryset.select_related():
        try:
            moderation.approve(question, request.user)
            ok += 1
        except Exception:
            skipped += 1
    if ok:
        modeladmin.message_user(
            request, f"{ok} questão(ões) aprovada(s).", messages.SUCCESS
        )
    if skipped:
        modeladmin.message_user(
            request,
            f"{skipped} questão(ões) ignorada(s): explicação ausente ou curta demais (mín. {moderation.MIN_EXPLANATION_CHARS} chars).",
            messages.WARNING,
        )


_approve_selected.short_description = (
    "✅ Aprovar selecionadas (exige explicação ≥ 120 chars)"
)


def _reject_selected(modeladmin, request, queryset):
    """Rejeita em lote com código 'fora_do_escopo'. Use para descartes óbvios."""
    count = 0
    for question in queryset.select_related():
        try:
            moderation.reject(
                question,
                request.user,
                reason="Rejeitada em lote pelo administrador.",
                reason_code="fora_do_escopo",
            )
            count += 1
        except Exception:
            pass
    modeladmin.message_user(
        request, f"{count} questão(ões) rejeitada(s).", messages.SUCCESS
    )


_reject_selected.short_description = "❌ Rejeitar selecionadas (fora_do_escopo)"


def _reopen_selected(modeladmin, request, queryset):
    """Devolve à fila — útil quando o conteúdo mudou na fonte."""
    count = 0
    for question in queryset.select_related():
        try:
            moderation.reopen(question, request.user, note="Reabertura em lote.")
            count += 1
        except Exception:
            pass
    modeladmin.message_user(
        request, f"{count} questão(ões) devolvida(s) à fila.", messages.SUCCESS
    )


_reopen_selected.short_description = "🔄 Reabrir selecionadas (volta a PENDING)"


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "status",
        "discipline",
        "banca",
        "year",
        "exam",
        "has_comment",
        "comment_requests",
        "error_count",
        "is_active",
    )
    list_filter = (
        CommentStatusFilter,
        "status",
        "source",
        "is_active",
        "discipline",
        "banca",
        "year",
    )
    list_select_related = ("source", "exam")
    search_fields = ("statement", "explanation", "external_id")
    autocomplete_fields = ("exam", "source", "reviewed_by")
    readonly_fields = ("content_hash", "reviewed_at", "created_at", "updated_at")
    actions = [_approve_selected, _reject_selected, _reopen_selected]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .annotate(
                error_count=Count(
                    "answers", filter=Q(answers__is_correct=False), distinct=True
                ),
                comment_requests_count=Count(
                    "error_reports",
                    filter=Q(
                        error_reports__description="Solicitação de gabarito comentado."
                    ),
                    distinct=True,
                ),
            )
        )

    @admin.display(boolean=True, description="Comentada")
    def has_comment(self, obj):
        return bool(obj.explanation.strip())

    @admin.display(ordering="error_count", description="Erros")
    def error_count(self, obj):
        return obj.error_count

    @admin.display(
        ordering="comment_requests_count", description="Pedidos de comentário"
    )
    def comment_requests(self, obj):
        return obj.comment_requests_count


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "banca",
        "institution",
        "role",
        "level",
        "state",
        "year",
        "is_published",
    )
    list_filter = ("is_published", "banca", "level", "state", "year")
    search_fields = ("title", "institution", "role")


@admin.register(QuestionSource)
class QuestionSourceAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "kind", "license_name", "is_active", "last_sync_at")
    list_filter = ("kind", "is_active", "requires_attribution")
    list_editable = ("is_active",)
    search_fields = ("name", "slug", "license_name")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("facets_at", "last_sync_at", "created_at", "updated_at")


@admin.register(SearchRun)
class SearchRunAdmin(admin.ModelAdmin):
    """Histórico das buscas: os filtros usados e o resultado de cada execução."""

    list_display = (
        "__str__",
        "source",
        "status",
        "fingerprint",
        "started_at",
        "started_by",
    )
    list_filter = ("status", "source")
    list_select_related = ("source", "started_by", "parent")
    search_fields = ("name", "fingerprint")
    date_hierarchy = "started_at"
    readonly_fields = [f.name for f in SearchRun._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(QuestionStemToken)
class QuestionStemTokenAdmin(admin.ModelAdmin):
    list_display = ("question", "token", "df")
    list_filter = ("token",)
    list_select_related = ("question",)
    search_fields = ("token",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


admin.site.register(UserAnswer)
admin.site.register(QuestionReview)
admin.site.register(Favorite)
admin.site.register(QuestionNote)
admin.site.register(Comment)
admin.site.register(ErrorReport)

# Fluxo operacional da Fase 2: busca por fonte e histórico de execuções.
# Mantido junto aos ModelAdmins para continuar protegido por `admin_view` e não
# duplicar o pipeline em uma segunda camada HTTP.
from django.core.exceptions import ValidationError
from django.shortcuts import redirect, render
from django.urls import path, reverse

from apps.questions.ingest import run as run_question_search
from apps.questions.ingest.sources import AdapterNotConfigured, get_adapter


def _source_search_context(request, source=None):
    rows = []
    if source:
        adapter = get_adapter(source)
        current = request.POST if request.method == "POST" else request.GET
        for spec in adapter.filters():
            try:
                options = adapter.list_options(spec, current)
            except (AdapterNotConfigured, ValidationError):
                options = []
            rows.append({"spec": spec, "options": options, "value": current.get(spec.key, "")})
    return {"title": "Buscar questões por fonte", "sources": QuestionSource.objects.filter(is_active=True).order_by("name"), "source": source, "filter_rows": rows}


def _question_source_search(request):
    source = QuestionSource.objects.filter(slug=request.POST.get("source") or request.GET.get("source"), is_active=True).first()
    context = _source_search_context(request, source)
    if request.method != "POST" or request.POST.get("action") != "search":
        return render(request, "admin/questions/questionsource/search.html", context)
    if not source:
        messages.error(request, "Escolha uma fonte ativa.")
        return render(request, "admin/questions/questionsource/search.html", context)
    try:
        adapter = get_adapter(source)
        filters = {spec.key: request.POST.get(spec.key) for spec in adapter.filters() if request.POST.get(spec.key) not in (None, "")}
        limit = max(1, min(int(request.POST.get("limit", 200)), 1000))
        run = run_question_search(source, filters, limit=limit, started_by=request.user, dry_run=request.POST.get("dry_run") == "on")
    except (ValidationError, AdapterNotConfigured, ValueError) as exc:
        messages.error(request, str(exc))
        return render(request, "admin/questions/questionsource/search.html", context)
    messages.success(request, f"Busca #{run.pk} concluída: {run.counts.get('created', 0)} questão(ões) na fila.")
    return redirect("admin:questions_searchrun_history")


def _run_operation(request, pk, operation):
    run = SearchRun.objects.select_related("source").filter(pk=pk).first()
    if not run:
        messages.error(request, "Busca não encontrada.")
        return redirect("admin:questions_searchrun_history")
    try:
        if operation == "continue":
            if not run.next_page:
                raise ValidationError("Esta busca não possui próxima página.")
            result = run_question_search(run.source, run.filters, page=run.next_page, limit=200, started_by=request.user, parent=run)
        elif operation == "import-skipped":
            if not (run.duplicates_preview or (run.counts or {}).get("duplicates_skipped")):
                raise ValidationError("Esta busca não possui duplicatas descartadas.")
            result = run_question_search(run.source, run.filters, limit=200, started_by=request.user, parent=run, force_duplicates=True)
        else:
            result = run_question_search(run.source, run.filters, page=1, limit=200, started_by=request.user, parent=run)
    except (ValidationError, AdapterNotConfigured, ValueError) as exc:
        messages.error(request, str(exc))
    else:
        messages.success(request, f"Busca #{result.pk} concluída: {result.counts.get('created', 0)} criada(s), {result.counts.get('duplicates_skipped', 0)} duplicata(s) pulada(s).")
    return redirect("admin:questions_searchrun_history")


def _search_run_history(request):
    runs = SearchRun.objects.select_related("source", "started_by", "parent").order_by("-started_at")[:200]
    return render(request, "admin/questions/searchrun/history.html", {"title": "Histórico de buscas", "runs": runs})


def _question_source_admin_urls(self):
    custom = [path("search/", self.admin_site.admin_view(_question_source_search), name="questions_questionsource_search")]
    return custom + super(QuestionSourceAdmin, self).get_urls()


def _search_run_admin_urls(self):
    custom = [
        path("history/", self.admin_site.admin_view(_search_run_history), name="questions_searchrun_history"),
        path("<int:pk>/continue/", self.admin_site.admin_view(lambda request, pk: _run_operation(request, pk, "continue")), name="questions_searchrun_continue"),
        path("<int:pk>/rerun/", self.admin_site.admin_view(lambda request, pk: _run_operation(request, pk, "rerun")), name="questions_searchrun_rerun"),
        path("<int:pk>/import-skipped/", self.admin_site.admin_view(lambda request, pk: _run_operation(request, pk, "import-skipped")), name="questions_searchrun_import_skipped"),
    ]
    return custom + super(SearchRunAdmin, self).get_urls()


def _source_save_model(self, request, obj, form, change):
    if obj.is_active and not obj.license_name.strip():
        raise ValidationError("Informe a licença antes de ativar uma fonte.")
    return super(QuestionSourceAdmin, self).save_model(request, obj, form, change)


QuestionSourceAdmin.get_urls = _question_source_admin_urls
QuestionSourceAdmin.save_model = _source_save_model
SearchRunAdmin.get_urls = _search_run_admin_urls
QuestionAdmin.list_filter = (*QuestionAdmin.list_filter, "search_run")
