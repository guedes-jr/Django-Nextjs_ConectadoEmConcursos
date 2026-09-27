from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.shortcuts import redirect, render
from django.urls import path

from apps.questions import moderation
from apps.questions.ingest import run as run_question_search
from apps.questions.ingest.sources import AdapterNotConfigured, get_adapter
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
from apps.questions.queue import (
    COMMENT_REQUEST_DESCRIPTION,
    QUEUE_PRIORITY_ORDER,
    annotate_queue_priority,
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

def _bulk_action(modeladmin, request, queryset, action, label: str, **kwargs) -> tuple[int, int]:
    """Aplica `moderation.<action>` item a item e devolve (aplicados, ignorados).

    Um item que viola a regra (aprovação sem explicação, motivo inválido) não
    interrompe o lote: ele é contado e o admin recebe o aviso com o motivo.
    """
    applied = skipped = 0
    reason = ""
    for question in queryset.select_related():
        try:
            action(question, request.user, **kwargs)
        except ValidationError as exc:
            skipped += 1
            reason = "; ".join(exc.messages)
        else:
            applied += 1
    if applied:
        modeladmin.message_user(
            request, f"{applied} questão(ões) {label}.", messages.SUCCESS
        )
    if skipped:
        modeladmin.message_user(
            request,
            f"{skipped} questão(ões) ignorada(s): {reason}"
            f" (mínimo de {moderation.MIN_EXPLANATION_CHARS} caracteres na explicação).",
            messages.WARNING,
        )
    return applied, skipped


def _approve_selected(modeladmin, request, queryset):
    """Aprova em lote — só questões com explicação já gravada (≥ 120 chars)."""
    _bulk_action(modeladmin, request, queryset, moderation.approve, "aprovada(s)")


_approve_selected.short_description = (
    "✅ Aprovar selecionadas (exige explicação ≥ 120 chars)"
)


def _reject_selected(modeladmin, request, queryset):
    """Rejeita em lote com código 'fora_do_escopo'. Use para descartes óbvios."""
    _bulk_action(
        modeladmin,
        request,
        queryset,
        moderation.reject,
        "rejeitada(s)",
        reason="Rejeitada em lote pelo administrador.",
        reason_code="fora_do_escopo",
    )


_reject_selected.short_description = "❌ Rejeitar selecionadas (fora_do_escopo)"


def _reopen_selected(modeladmin, request, queryset):
    """Devolve à fila — útil quando o conteúdo mudou na fonte."""
    _bulk_action(
        modeladmin,
        request,
        queryset,
        moderation.reopen,
        "devolvida(s) à fila",
        note="Reabertura em lote.",
    )


_reopen_selected.short_description = "🔄 Reabrir selecionadas (volta a PENDING)"


def _mark_duplicate_selected(modeladmin, request, queryset):
    """Marca como duplicada o enunciado que já existe na base.

    É o atalho para quando a fila deixou passar um enunciado repetido: a questão
    sai da fila com o motivo estruturado `duplicada`, que alimenta o relatório de
    fonte ruim.
    """
    _bulk_action(
        modeladmin,
        request,
        queryset,
        moderation.reject,
        "marcada(s) como duplicada(s)",
        reason="Marcada como duplicada pelo administrador.",
        reason_code="duplicada",
    )


_mark_duplicate_selected.short_description = "♻️ Marcar selecionadas como duplicada"


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "queue_status",
        "discipline",
        "banca",
        "year",
        "exam",
        "has_comment",
        "comment_requests",
        "error_count",
    )
    list_filter = (
        CommentStatusFilter,
        "status",
        "source",
        "discipline",
        "banca",
        "year",
    )
    list_select_related = ("source", "exam")
    search_fields = ("statement", "explanation", "external_id")
    autocomplete_fields = ("exam", "source", "reviewed_by")
    readonly_fields = ("content_hash", "reviewed_at", "created_at", "updated_at")
    actions = [
        _approve_selected,
        _reject_selected,
        _reopen_selected,
        _mark_duplicate_selected,
    ]

    def get_queryset(self, request):
        # A ordenação depende das annotations, então o `super()` (que ordena antes
        # de existir `status_order`) não pode ser usado aqui.
        queryset = annotate_queue_priority(self.model._default_manager.get_queryset())
        ordering = self.get_ordering(request)
        return queryset.order_by(*ordering) if ordering else queryset

    def get_ordering(self, request):
        """Fila primeiro, e dentro dela o que mais rende: pedidos de comentário e erros."""
        return list(QUEUE_PRIORITY_ORDER)

    @admin.display(ordering="status_order", description="status")
    def queue_status(self, obj):
        return obj.get_status_display()

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

    def save_model(self, request, obj, form, change):
        # Ativar uma fonte é autorizar o uso do conteúdo dela: sem licença
        # declarada, a proveniência some e não dá para responder "de onde veio".
        if obj.is_active and not obj.license_name.strip():
            raise ValidationError(
                {"license_name": "Informe a licença antes de ativar a fonte."}
            )
        super().save_model(request, obj, form, change)


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


def _error_text(exc: Exception) -> str:
    """Mensagem legível no admin: `ValidationError` de filtro vem como dicionário."""
    if isinstance(exc, ValidationError) and hasattr(exc, "message_dict"):
        return "; ".join(
            f"{field}: {', '.join(items)}"
            for field, items in exc.message_dict.items()
        )
    return str(exc)


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
        messages.error(request, _error_text(exc))
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
            result = run_question_search(run.source, run.filters, page=run.next_page, limit=run.limit, started_by=request.user, parent=run)
        elif operation == "import-skipped":
            if not (run.duplicates_preview or (run.counts or {}).get("duplicates_skipped")):
                raise ValidationError("Esta busca não possui duplicatas descartadas.")
            result = run_question_search(run.source, run.filters, limit=run.limit, started_by=request.user, parent=run, force_duplicates=True)
        else:
            result = run_question_search(run.source, run.filters, page=1, limit=run.limit, started_by=request.user, parent=run)
    except (ValidationError, AdapterNotConfigured, ValueError) as exc:
        messages.error(request, _error_text(exc))
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
