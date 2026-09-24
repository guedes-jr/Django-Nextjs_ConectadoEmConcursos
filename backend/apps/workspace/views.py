from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from allauth.socialaccount.models import SocialAccount
from apps.questions.models import Question, QuestionNote, UserAnswer
from .models import CommunityPost, ExamSubmission, Flashcard, Notebook, SimulationRun


def _notebook(item):
    return {"id": item.id, "title": item.title, "question_ids": list(item.questions.values_list("id", flat=True)), "created_at": item.created_at}


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def notebooks(request):
    if request.method == "GET":
        return Response([_notebook(item) for item in Notebook.objects.filter(user=request.user).order_by("-created_at")])
    title = str(request.data.get("title", "")).strip()
    if not 1 <= len(title) <= 120:
        return Response({"title": "Informe um título com até 120 caracteres."}, status=400)
    return Response(_notebook(Notebook.objects.create(user=request.user, title=title)), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def notebook_detail(request, item_id):
    item = Notebook.objects.filter(user=request.user, id=item_id).first()
    if not item:
        return Response({"detail": "Caderno não encontrado."}, status=404)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    title = str(request.data.get("title", "")).strip()
    if not 1 <= len(title) <= 120:
        return Response({"title": "Informe um título com até 120 caracteres."}, status=400)
    item.title = title
    item.save(update_fields=["title"])
    return Response(_notebook(item))


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def notebook_questions(request, item_id):
    item = Notebook.objects.filter(user=request.user, id=item_id).first()
    if not item:
        return Response({"detail": "Caderno não encontrado."}, status=404)
    question_id = request.data.get("question_id")
    question = Question.objects.filter(id=question_id, is_active=True).first()
    if not question:
        return Response({"question_id": "Questão não encontrada."}, status=400)
    if request.method == "POST":
        item.questions.add(question)
    else:
        item.questions.remove(question)
    return Response(_notebook(item))


def _flashcard(item):
    return {"id": item.id, "discipline": item.discipline, "front": item.front, "back": item.back, "next_review_at": item.next_review_at, "interval_days": item.interval_days}


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def flashcards(request):
    if request.method == "GET":
        return Response([_flashcard(item) for item in Flashcard.objects.filter(user=request.user).order_by("next_review_at", "-id")[:200]])
    front = str(request.data.get("front", "")).strip()
    back = str(request.data.get("back", "")).strip()
    discipline = str(request.data.get("discipline", "")).strip()
    if not front or len(front) > 500 or not back or len(back) > 5000 or len(discipline) > 100:
        return Response({"detail": "Preencha frente e verso; a frente aceita até 500 caracteres."}, status=400)
    item = Flashcard.objects.create(user=request.user, front=front, back=back, discipline=discipline)
    return Response(_flashcard(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def flashcard_detail(request, item_id):
    item = Flashcard.objects.filter(user=request.user, id=item_id).first()
    if not item:
        return Response({"detail": "Cartão não encontrado."}, status=404)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    if "correct" in request.data:
        if type(request.data["correct"]) is not bool:
            return Response({"correct": "Informe verdadeiro ou falso."}, status=400)
        item.interval_days = min(30, max(1, item.interval_days * 2)) if request.data["correct"] else 1
        item.next_review_at = timezone.now() + timedelta(days=item.interval_days)
        item.save(update_fields=["interval_days", "next_review_at"])
    else:
        for key, limit in (("front", 500), ("back", 5000), ("discipline", 100)):
            if key in request.data:
                value = str(request.data[key]).strip()
                if len(value) > limit or (key != "discipline" and not value):
                    return Response({key: "Conteúdo inválido."}, status=400)
                setattr(item, key, value)
        item.save()
    return Response(_flashcard(item))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notes(request):
    return Response([{"question_id": item.question_id, "discipline": item.question.discipline, "content": item.content, "updated_at": item.updated_at} for item in QuestionNote.objects.filter(user=request.user).exclude(content="").select_related("question").order_by("-updated_at")[:200]])


def _post(item, user):
    return {"id": item.id, "kind": item.kind, "title": item.title, "content": item.content, "parent_id": item.parent_id, "author": item.user.get_username(), "created_at": item.created_at, "replies": item.replies.count(), "is_owner": item.user_id == user.id}


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def community(request):
    if request.method == "GET":
        kind = request.query_params.get("kind", "forum")
        if kind not in CommunityPost.Kind.values:
            return Response({"kind": "Tipo inválido."}, status=400)
        parent = request.query_params.get("parent")
        items = CommunityPost.objects.filter(kind=kind).select_related("user").prefetch_related("replies")
        items = items.filter(parent_id=parent) if parent and parent.isdigit() else items.filter(parent__isnull=True)
        return Response([_post(item, request.user) for item in items.order_by("-created_at")[:100]])
    kind = request.data.get("kind", "forum")
    title = str(request.data.get("title", "")).strip()
    content = str(request.data.get("content", "")).strip()
    parent_id = request.data.get("parent_id") or None
    if kind not in CommunityPost.Kind.values or not content or len(content) > 5000 or len(title) > 160 or (kind == "forum" and not parent_id and not title):
        return Response({"detail": "Informe título e mensagem válidos."}, status=400)
    parent = CommunityPost.objects.filter(pk=parent_id, kind=kind, parent__isnull=True).first() if parent_id else None
    if parent_id and not parent:
        return Response({"parent_id": "Publicação original não encontrada."}, status=400)
    item = CommunityPost.objects.create(user=request.user, kind=kind, title=title, content=content, parent=parent)
    return Response(_post(item, request.user), status=201)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def community_detail(request, item_id):
    item = CommunityPost.objects.filter(pk=item_id, user=request.user).first()
    if not item:
        return Response({"detail": "Publicação não encontrada."}, status=404)
    item.delete()
    return Response(status=204)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ranking(request):
    users = get_user_model().objects.filter(is_active=True, profile__show_in_ranking=True).annotate(total=Count("useranswer"), correct=Count("useranswer", filter=Q(useranswer__is_correct=True))).filter(total__gt=0).order_by("-correct", "-total", "id")[:50]
    return Response([{"position": index, "username": user.get_username(), "correct": user.correct, "total": user.total} for index, user in enumerate(users, 1)])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def people(request):
    search = request.query_params.get("search", "").strip()[:60]
    users = get_user_model().objects.filter(is_active=True, profile__is_public=True)
    if search:
        users = users.filter(Q(username__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))
    return Response([{"id": user.id, "username": user.get_username(), "name": user.get_full_name() or user.get_username()} for user in users.order_by("username")[:50]])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def people_detail(request, username):
    user = get_user_model().objects.filter(username__iexact=username).first()
    if not user:
        return Response({"detail": "Usuário não encontrado."}, status=404)
    profile = getattr(user, "profile", None)
    is_owner = request.user == user
    if (profile is None or not profile.is_public) and not is_owner:
        return Response({"detail": "Usuário não encontrado."}, status=404)

    def local_avatar_url():
        if not profile or not profile.avatar:
            return None
        url = profile.avatar.url
        return request.build_absolute_uri(url)

    account = SocialAccount.objects.filter(user=user, provider="google").first()
    social_avatar = (account.extra_data or {}).get("picture") if account else None

    return Response({
        "id": user.id,
        "username": user.get_username(),
        "name": user.get_full_name() or user.get_username(),
        "is_owner": is_owner,
        "avatar": local_avatar_url(),
        "social_avatar": social_avatar,
        "profession": (profile.profession if profile else "") or "",
        "target_role": (profile.target_role if profile else "") or "",
        "state": (profile.state if profile else "") or "",
        "city": (profile.city if profile else "") or "",
        "study_hours_per_day": profile.study_hours_per_day if profile else 0,
        "disciplines": (profile.disciplines if profile else []) or [],
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def simulations(request):
    runs = (
        SimulationRun.objects.filter(user=request.user)
        .exclude(status=SimulationRun.Status.IN_PROGRESS)
        .order_by("-created_at")[:50]
    )
    return Response([{
        "id": item.id,
        "score": item.score,
        "total": item.total,
        "created_at": item.created_at,
        "answers": item.answers,
        "status": item.status,
        "question_count": item.question_count,
        "discipline": item.discipline,
        "banca": item.banca,
        "year": item.year,
        "exam_ids": item.exam_ids,
        "time_limit_minutes": item.time_limit_minutes,
        "duration_seconds": item.duration_seconds,
        "started_at": item.started_at,
        "finished_at": item.finished_at,
    } for item in runs])


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def submissions(request):
    if request.method == "GET":
        return Response([{"id": item.id, "title": item.title, "source_url": item.source_url, "file_url": request.build_absolute_uri(item.file.url) if item.file else None, "status": item.status, "created_at": item.created_at} for item in ExamSubmission.objects.filter(user=request.user).order_by("-created_at")[:50]])
    title = str(request.data.get("title", "")).strip()
    source_url = str(request.data.get("source_url", "")).strip()
    description = str(request.data.get("description", "")).strip()
    uploaded = request.FILES.get("file")
    if not 1 <= len(title) <= 160:
        return Response({"detail": "Informe o título da prova."}, status=400)
    if len(description) > 2000:
        return Response({"detail": "As observações devem ter até 2000 caracteres."}, status=400)
    if uploaded:
        if source_url:
            return Response({"detail": "Escolha uma opção: enviar o link OU fazer upload do arquivo."}, status=400)
        if uploaded.size > 10 * 1024 * 1024:
            return Response({"detail": "O arquivo deve ter no máximo 10 MB."}, status=400)
        name = uploaded.name.lower()
        if not name.endswith((".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg")):
            return Response({"detail": "Formato não suportado. Envie PDF, DOC, DOCX, TXT ou imagem (PNG/JPG)."}, status=400)
        item = ExamSubmission.objects.create(user=request.user, title=title, file=uploaded, description=description)
    else:
        if not source_url.startswith("https://") or len(source_url) > 200:
            return Response({"detail": "Informe um link HTTPS para a prova."}, status=400)
        item = ExamSubmission.objects.create(user=request.user, title=title, source_url=source_url, description=description)
    return Response({"id": item.id, "status": item.status}, status=201)
