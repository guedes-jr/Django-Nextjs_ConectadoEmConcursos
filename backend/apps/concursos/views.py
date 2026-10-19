from collections import Counter

from django.db.models import Case, Count, F, Q, When
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ArticleView, Concurso, NewsArticle


AREAS = [
    ("saude", "Saúde e Assistência Social", [
        "médico", "enfermagem", "enfermeiro", "farmacêutico", "odontólogo", "dentista",
        "fisioterapeuta", "fonoaudiólogo", "nutricionista", "psicólogo", "biomédico",
        "agente comunitário", "agente de combate", "agente de endemias", "técnico em enfermagem",
        "auxiliar de enfermagem", "técnico de enfermagem", "assistente social", "veterinário",
        "educador físico", "técnico em saúde", "saúde pública", "vigilância sanitária",
        "terapeuta", "fonoaudiólog", "bioquímico",
    ]),
    ("educacao", "Educação", [
        "professor", "pedagogo", "docente", "educação infantil", "educador", "diretor escolar",
        "coordenador pedagógico", "coordenador(a) pedagógico", "orientador escolar",
        "supervisor escolar", "língua portuguesa", "língua estrangeira", "instrutor",
        "profissional de apoio escolar", "especialista em educação", "monitor escolar",
        "bibliotecário", "docência",
    ]),
    ("juridica", "Jurídica", [
        "advogado", "procurador", "defensor", "magistratura", "juiz", "promotor",
        "oficial jurídico", "assessor jurídico", "analista jurídico", "técnico judiciário",
        "escrivão", "oficial de justiça", "jurídico", "cartório", "delegado",
    ]),
    ("seguranca", "Segurança Pública", [
        "guarda civil", "guarda municipal", "policial", "polícia", "bombeiro",
        "agente penitenciário", "agente prisional", "agente de trânsito", "soldado",
        "oficial de estado-maior", "penitenciário", "agente de segurança", "carcelário",
        "carcerário", "segurança pública",
    ]),
    ("tributaria", "Tributária e Fiscal", [
        "auditor", "fiscal", "tributário", "tributário", "arrecadação", "receita",
        "controle interno", "controlador interno", "conselheiro", "agente fiscal",
        "analista da receita", "fazendário", "tributos",
    ]),
    ("ti", "Tecnologia da Informação", [
        "tecnologia da informação", "analista de sistemas", "analista de ti", "desenvolvedor",
        "programador", "informática", "técnico em informática", "técnico em ti", "análise de sistemas",
    ]),
    ("engenharia", "Engenharia e Técnicas", [
        "engenheiro", "arquiteto", "topógrafo", "agrimensor", "agente ambiental",
        "analista ambiental", "geólogo", "químico", "infraestrutura", "urbanista",
        "técnico agrícola", "agrônomo", "técnico agropecuário", "técnico em edificações",
        "técnico em segurança do trabalho", "obras", "manutenção", "técnico em obras",
    ]),
    ("economia", "Economia e Contabilidade", [
        "contador", "contabilidade", "economista", "administrador", "auxiliar de contabilidade",
        "analista financeiro", "tesoureiro", "financeiro", "gestão", "administração",
    ]),
    ("comunicacao", "Comunicação e Cultura", [
        "jornalista", "comunicador", "radialista", "publicitário", "relações públicas",
        "fotógrafo", "cultura", "museólogo", "turismo", "eventos",
    ]),
]

AREA_LABELS = {key: label for key, label, _ in AREAS}
AREA_LABELS["varios"] = "Vários cargos"
AREA_LABELS["outros"] = "Outras áreas"


def classify_area(item: Concurso) -> tuple[str, str]:
    text = " ".join(item.roles).lower()
    text += " " + item.headline.lower()
    text += " " + item.title.lower()
    text += " " + item.organization.lower()
    if "vários cargos" in text:
        return "varios", AREA_LABELS["varios"]
    for key, label, keywords in AREAS:
        if any(keyword in text for keyword in keywords):
            return key, label
    return "outros", AREA_LABELS["outros"]


def concurso_repr(item: Concurso) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "official_url": item.official_url,
        "banca_name": item.banca.name if item.banca_id else None,
        "organization": item.organization,
        "headline": item.headline,
        "roles": item.roles,
        "levels": item.levels,
        "state": item.state,
        "region": item.region,
        "status": item.status,
        "deadline": item.deadline.isoformat() if item.deadline else None,
        "source_url": item.source_url,
        "source": item.source,
        "vacancies": item.vacancies,
        "max_salary": item.max_salary,
    }


def news_repr(item: NewsArticle) -> dict:
    return {
        "id": item.id,
        "slug": item.slug,
        "title": item.title,
        "summary": item.summary,
        "body": item.body,
        "category": item.category,
        "image_url": item.image_url,
        "source_url": item.source_url,
        "source": item.source,
        "published_at": item.published_at.isoformat() if item.published_at else None,
    }


@api_view(["GET"])
def concursos_list(request):
    queryset = Concurso.objects.filter(editorial_status=Concurso.EditorialStatus.PUBLISHED).select_related("banca")
    state = request.query_params.get("state")
    status = request.query_params.get("status")
    region = request.query_params.get("region")
    area = request.query_params.get("area")
    search = request.query_params.get("search")
    role = request.query_params.get("role")

    if state:
        states = [uf.strip().upper() for uf in state.split(",") if uf.strip()]
        queryset = queryset.filter(state__in=states)
    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        queryset = queryset.filter(status__in=statuses)
    if region:
        regions = [r.strip().lower() for r in region.split(",") if r.strip()]
        region_q = Q()
        for r in regions:
            region_q |= Q(region__iexact=r) | Q(region__iexact=r.title())
        queryset = queryset.filter(region_q)
    if area:
        areas = {a.strip() for a in area.split(",") if a.strip()}
        area_ids = [c.id for c in queryset if classify_area(c)[0] in areas]
        queryset = queryset.filter(id__in=area_ids)
    if search:
        queryset = queryset.filter(Q(title__icontains=search) | Q(organization__icontains=search))
    if role:
        queryset = queryset.filter(roles__icontains=role)

    facets = None
    if request.query_params.get("facets") == "1":
        facets = {
            "states": list(
                queryset.exclude(state="").values("state").annotate(count=Count("id"))
                .order_by("-count").values("state", "count")
            ),
            "regions": list(
                queryset.exclude(region="").values("region").annotate(count=Count("id"))
                .order_by("-count").values("region", "count")
            ),
            "areas": [
                {"area": key, "label": AREA_LABELS[key], "count": count}
                for key, count in Counter(
                    (classify_area(item)[0] for item in queryset)
                ).most_common()
            ],
            "statuses": list(
                queryset.values("status").annotate(count=Count("id")).order_by("status")
            ),
            "total": queryset.count(),
        }

    priority = Case(
        When(status=Concurso.Status.OPEN, then=0),
        When(status=Concurso.Status.EXPECTED, then=1),
        default=2,
    )
    queryset = queryset.order_by(priority, F("deadline").asc(nulls_last=True), "title")

    try:
        limit = int(request.query_params.get("limit", 30))
        offset = int(request.query_params.get("offset", 0))
    except (TypeError, ValueError):
        return Response({"detail": "Use valores inteiros para limit/offset."}, status=400)
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    count = queryset.count()
    results = [concurso_repr(item) for item in queryset[offset: offset + limit]]
    return Response({"count": count, "results": results, "facets": facets})


def _content_list(request, origin):
    queryset = NewsArticle.objects.filter(origin=origin, is_published=True, editorial_status=NewsArticle.EditorialStatus.PUBLISHED)
    category = request.query_params.get("category")
    search = request.query_params.get("search")
    if category:
        queryset = queryset.filter(category=category)
    if search:
        queryset = queryset.filter(Q(title__icontains=search) | Q(summary__icontains=search))

    facets = None
    if request.query_params.get("facets") == "1":
        facets = {
            "categories": list(
                queryset.exclude(category="").values("category").annotate(count=Count("id"))
                .order_by("-count").values("category", "count")
            ),
            "total": queryset.count(),
        }

    try:
        limit = int(request.query_params.get("limit", 24))
        offset = int(request.query_params.get("offset", 0))
    except (TypeError, ValueError):
        return Response({"detail": "Use valores inteiros para limit/offset."}, status=400)
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    count = queryset.count()
    results = [news_repr(item) for item in queryset[offset: offset + limit]]
    return Response({"count": count, "results": results, "facets": facets})


def _content_detail(request, slug, origin):
    item = NewsArticle.objects.filter(origin=origin, slug=slug, is_published=True, editorial_status=NewsArticle.EditorialStatus.PUBLISHED).first()
    if not item:
        return Response({"detail": "Conteúdo não encontrado."}, status=404)
    if not request.session.session_key: request.session.save()
    ArticleView.objects.create(article=item, user=request.user if request.user.is_authenticated else None, session_key=request.session.session_key or "", referrer=request.META.get("HTTP_REFERER", "")[:500])
    return Response(news_repr(item))

@api_view(["GET"])
def news_list(request):
    return _content_list(request, "imported")


@api_view(["GET"])
def news_detail(request, slug):
    return _content_detail(request, slug, "imported")


@api_view(["GET"])
def articles_list(request):
    return _content_list(request, "manual")


@api_view(["GET"])
def articles_detail(request, slug):
    return _content_detail(request, slug, "manual")


@api_view(["GET"])
def concurso_detail(request, pk):
    from django.shortcuts import get_object_or_404
    from apps.questions.models import Exam, Question
    from apps.questions.serializers import ExamSerializer
    from .catalog import public_resources
    item = get_object_or_404(Concurso.objects.select_related("banca"), pk=pk, editorial_status=Concurso.EditorialStatus.PUBLISHED)
    exams = Exam.objects.filter(concurso=item, is_published=True).select_related("concurso").annotate(
        question_count=Count("questions", filter=Q(questions__status=Question.Status.APPROVED), distinct=True))
    return Response({**concurso_repr(item), "description": item.description, "body": item.body,
                     "resources": public_resources(item), "exams": ExamSerializer(exams, many=True).data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def resource_file(request, pk, resource_id):
    from django.http import FileResponse
    from django.shortcuts import get_object_or_404
    from .models import ConcursoResource
    from apps.backoffice.audit import log as audit_log
    item = get_object_or_404(ConcursoResource.objects.select_related("concurso", "exam"), pk=resource_id, concurso_id=pk)
    staff = bool(request.user.is_active and request.user.is_staff)
    published = (item.is_published and item.concurso.editorial_status == "published" and
                 (not item.exam_id or (item.exam.is_published and item.exam.concurso_id == item.concurso_id)))
    if not item.file or (not staff and not published):
        return Response({"detail": "Arquivo não disponível."}, status=404)
    try:
        handle = item.file.open("rb")
    except (OSError, ValueError):
        return Response({"detail": "Arquivo não disponível."}, status=404)
    try:
        audit_log(request, action="concurso.resource_downloaded", resource_type="concurso_resource", resource_id=item.pk,
                  context={"staff_preview": staff and not published})
    except Exception:
        handle.close()
        raise
    response = FileResponse(handle, as_attachment=True, filename=item.file_name or "material.pdf", content_type="application/pdf")
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    response["Cache-Control"] = "private, no-store"
    response["Vary"] = "Cookie, Authorization"
    return response
