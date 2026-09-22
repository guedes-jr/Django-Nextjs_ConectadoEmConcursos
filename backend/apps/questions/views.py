from datetime import timedelta

from django.db.models import Count, Exists, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from apps.questions.models import Comment, ErrorReport, Exam, Favorite, Question, QuestionNote, UserAnswer
from apps.questions.serializers import AnswerSerializer, CommentSerializer, ExamSerializer, NoteSerializer, QuestionSerializer, ReportSerializer
from apps.billing.services import capabilities_for


def questions_for_user(user):
    latest_answers = UserAnswer.objects.filter(
        user=user, question=OuterRef("pk")
    ).order_by("-created_at")
    return Question.objects.filter(is_active=True).annotate(
        is_favorite=Exists(Favorite.objects.filter(user=user, question=OuterRef("pk"))),
        comment_count=Count("comments", distinct=True),
        latest_answer=Subquery(
            latest_answers.values("selected_answer")[:1], output_field=IntegerField()
        ),
    )


class ExamViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Exam.objects.filter(is_published=True).annotate(
            question_count=Count("questions", filter=Q(questions__is_active=True), distinct=True)
        )
        search = self.request.query_params.get("search", "").strip()
        banca = self.request.query_params.get("banca", "").strip()
        year = self.request.query_params.get("year", "").strip()
        discipline = self.request.query_params.get("discipline", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(role__icontains=search)
                | Q(institution__icontains=search)
            )
        if banca:
            queryset = queryset.filter(banca__iexact=banca)
        if year.isdigit():
            queryset = queryset.filter(year=int(year))
        if discipline:
            queryset = queryset.filter(questions__discipline__iexact=discipline).distinct()
        return queryset

    @action(detail=True, methods=["get"])
    def questions(self, request, pk=None):
        exam = self.get_object()
        queryset = questions_for_user(request.user).filter(exam=exam)
        return Response(QuestionSerializer(queryset, many=True).data)


class QuestionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = QuestionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = questions_for_user(self.request.user)

        search = self.request.query_params.get("search", "").strip()
        discipline = self.request.query_params.get("discipline", "").strip()
        banca = self.request.query_params.get("banca", "").strip()
        year = self.request.query_params.get("year", "").strip()
        favorites = self.request.query_params.get("favorites", "").lower()
        exam = self.request.query_params.get("exam", "").strip()

        if search:
            queryset = queryset.filter(statement__icontains=search)
        if discipline:
            queryset = queryset.filter(discipline__iexact=discipline)
        if banca:
            queryset = queryset.filter(banca__iexact=banca)
        if year.isdigit():
            queryset = queryset.filter(year=int(year))
        if favorites in {"1", "true"}:
            queryset = queryset.filter(is_favorite=True)
        if exam.isdigit():
            queryset = queryset.filter(exam_id=int(exam))
        return queryset

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        question = self.get_object()
        limit = capabilities_for(request.user)["questions_daily"]
        if limit is not None and UserAnswer.objects.filter(
            user=request.user, created_at__date=timezone.localdate()
        ).count() >= limit:
            return Response(
                {"detail": f"Limite diário de {limit} questões atingido para seu plano."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        serializer = AnswerSerializer(data=request.data, context={"question": question})
        serializer.is_valid(raise_exception=True)
        selected = serializer.validated_data["selected_answer"]
        answer = UserAnswer.objects.create(
            user=request.user,
            question=question,
            selected_answer=selected,
            is_correct=selected == question.correct_answer,
        )
        return Response({
            "attempt_id": answer.id,
            "selected_answer": selected,
            "correct_answer": question.correct_answer,
            "is_correct": answer.is_correct,
            "explanation": question.explanation,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def favorite(self, request, pk=None):
        question = self.get_object()
        favorite, created = Favorite.objects.get_or_create(user=request.user, question=question)
        if not created:
            favorite.delete()
        return Response({"is_favorite": created})

    @action(detail=True, methods=["get", "put", "delete"])
    def note(self, request, pk=None):
        question = self.get_object()
        note = QuestionNote.objects.filter(user=request.user, question=question).first()
        if request.method == "GET":
            return Response({"content": note.content if note else ""})
        if request.method == "DELETE":
            if note:
                note.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note, _ = QuestionNote.objects.update_or_create(
            user=request.user,
            question=question,
            defaults={"content": serializer.validated_data["content"]},
        )
        return Response({"content": note.content})

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, pk=None):
        question = self.get_object()
        if request.method == "GET":
            serializer = CommentSerializer(
                question.comments.select_related("user"), many=True, context={"request": request}
            )
            return Response(serializer.data)
        serializer = CommentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user, question=question)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None):
        question = self.get_object()
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = ErrorReport.objects.create(
            user=request.user,
            question=question,
            description=serializer.validated_data["description"],
        )
        return Response({"id": report.id, "status": report.status}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def comment_detail(request, comment_id):
    comment = get_object_or_404(Comment, pk=comment_id, user=request.user)
    if request.method == "DELETE":
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = CommentSerializer(
        comment, data=request.data, partial=True, context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def statistics(request):
    today = timezone.localdate()
    start_7_days = today - timedelta(days=6)
    start_30_days = today - timedelta(days=29)
    answers = UserAnswer.objects.filter(user=request.user)

    total = answers.count()
    correct = answers.filter(is_correct=True).count()
    today_total = answers.filter(created_at__date=today).count()
    last_30 = answers.filter(created_at__date__gte=start_30_days)
    last_30_total = last_30.count()
    last_30_correct = last_30.filter(is_correct=True).count()

    daily_rows = {
        row["day"]: row
        for row in answers.filter(created_at__date__gte=start_7_days)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
        .order_by("day")
    }
    daily = []
    for offset in range(7):
        day = start_7_days + timedelta(days=offset)
        row = daily_rows.get(day, {})
        day_total = row.get("total", 0)
        day_correct = row.get("correct", 0)
        daily.append({
            "date": day.isoformat(),
            "total": day_total,
            "correct": day_correct,
            "accuracy": round(day_correct * 100 / day_total) if day_total else 0,
        })

    disciplines = list(
        answers.values("question__discipline")
        .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
        .order_by("-total", "question__discipline")
    )
    for row in disciplines:
        row["discipline"] = row.pop("question__discipline")
        row["accuracy"] = round(row["correct"] * 100 / row["total"])

    activity_dates = list(
        answers.annotate(day=TruncDate("created_at"))
        .values_list("day", flat=True)
        .distinct()
        .order_by("-day")
    )
    streak = 0
    if activity_dates and activity_dates[0] in {today, today - timedelta(days=1)}:
        expected = activity_dates[0]
        for day in activity_dates:
            if day != expected:
                break
            streak += 1
            expected -= timedelta(days=1)

    recent_activity = [
        {
            "id": answer.id,
            "date": timezone.localtime(answer.created_at).isoformat(),
            "question_id": answer.question_id,
            "discipline": answer.question.discipline,
            "is_correct": answer.is_correct,
        }
        for answer in answers.select_related("question")[:10]
    ]

    return Response({
        "today_total": today_total,
        "total": total,
        "correct": correct,
        "accuracy": round(correct * 100 / total) if total else 0,
        "streak": streak,
        "last_30_total": last_30_total,
        "last_30_correct": last_30_correct,
        "last_30_accuracy": round(last_30_correct * 100 / last_30_total) if last_30_total else 0,
        "daily": daily,
        "disciplines": disciplines,
        "recent_activity": recent_activity,
    })
