from datetime import timedelta
from random import sample

from django.db import transaction
from django.db.models import BooleanField, Count, DateTimeField, Exists, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.questions.models import Comment, ErrorReport, Exam, Favorite, Question, QuestionNote, QuestionReview, SimulationTemplate, UserAnswer
from apps.questions.review import schedule_review
from apps.questions.serializers import AnswerSerializer, CommentSerializer, ExamSerializer, NoteSerializer, QuestionSerializer, ReportSerializer, SimulationTemplateSerializer
from apps.billing.services import capabilities_for
from apps.workspace.models import SimulationRun


def questions_for_user(user):
    latest_answers = UserAnswer.objects.filter(
        user=user, question=OuterRef("pk")
    ).order_by("-created_at", "-id")
    reviews = QuestionReview.objects.filter(user=user, question=OuterRef("pk"))
    return Question.objects.filter(is_active=True).select_related("exam").annotate(
        is_favorite=Exists(Favorite.objects.filter(user=user, question=OuterRef("pk"))),
        comment_count=Count("comments", distinct=True),
        latest_answer=Subquery(
            latest_answers.values("selected_answer")[:1], output_field=IntegerField()
        ),
        latest_is_correct=Subquery(
            latest_answers.values("is_correct")[:1], output_field=BooleanField()
        ),
        is_marked=Exists(reviews.filter(is_marked=True)),
        review_due=Exists(reviews.filter(Q(is_marked=True) | Q(next_review_at__lte=timezone.now()))),
        next_review_at=Subquery(reviews.values("next_review_at")[:1], output_field=DateTimeField()),
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


class QuestionPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


class QuestionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = QuestionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = QuestionPagination

    @action(detail=False, methods=["get"])
    def disciplines(self, request):
        values = (
            Question.objects.filter(is_active=True)
            .order_by("discipline")
            .values_list("discipline", flat=True)
            .distinct()
        )
        return Response(list(values))

    @action(detail=False, methods=["get"])
    def facets(self, request):
        queryset = Question.objects.filter(is_active=True)
        return Response({
            "disciplines": list(queryset.order_by("discipline").values_list("discipline", flat=True).distinct()),
            "bancas": list(queryset.order_by("banca").values_list("banca", flat=True).distinct()),
            "years": list(queryset.order_by("-year").values_list("year", flat=True).distinct()),
        })

    def get_queryset(self):
        queryset = questions_for_user(self.request.user)

        search = self.request.query_params.get("search", "").strip()
        discipline = self.request.query_params.get("discipline", "").strip()
        banca = self.request.query_params.get("banca", "").strip()
        year = self.request.query_params.get("year", "").strip()
        favorites = self.request.query_params.get("favorites", "").lower()
        exam = self.request.query_params.get("exam", "").strip()
        progress = self.request.query_params.get("progress", "").strip()

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
        if progress == "unanswered":
            queryset = queryset.filter(latest_answer__isnull=True)
        elif progress == "correct":
            queryset = queryset.filter(latest_is_correct=True)
        elif progress == "incorrect":
            queryset = queryset.filter(latest_is_correct=False)
        elif progress == "review":
            queryset = queryset.filter(review_due=True)
        return queryset.order_by("-year", "id")

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
        review = schedule_review(request.user, question, answer.is_correct)
        return Response({
            "attempt_id": answer.id,
            "selected_answer": selected,
            "correct_answer": question.correct_answer,
            "is_correct": answer.is_correct,
            "explanation": question.explanation,
            "next_review_at": review.next_review_at,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="simulations/start")
    def start_simulation(self, request):
        data = request.data
        full_exam = bool(data.get("full_exam"))
        time_limit = data.get("time_limit_minutes")
        if time_limit is not None:
            if not isinstance(time_limit, int) or not 1 <= time_limit <= 180:
                return Response({"detail": "Tempo limite inválido."}, status=status.HTTP_400_BAD_REQUEST)

        queryset = Question.objects.filter(is_active=True)
        discipline = str(data.get("discipline") or "").strip()
        banca = str(data.get("banca") or "").strip()
        year = data.get("year")
        exam_ids = data.get("exam_ids") or []

        if exam_ids:
            if not isinstance(exam_ids, list) or not all(isinstance(i, int) for i in exam_ids):
                return Response({"detail": "Provas inválidas."}, status=status.HTTP_400_BAD_REQUEST)
            published_ids = set(Exam.objects.filter(is_published=True).values_list("id", flat=True))
            if not set(exam_ids).issubset(published_ids):
                return Response({"detail": "Uma ou mais provas não estão disponíveis."}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(exam__in=exam_ids)
        if discipline:
            queryset = queryset.filter(discipline__iexact=discipline)
        if banca:
            queryset = queryset.filter(banca__iexact=banca)
        if isinstance(year, int) or (isinstance(year, str) and year.isdigit()):
            queryset = queryset.filter(year=int(year))

        if full_exam:
            if len(exam_ids) != 1:
                return Response({"detail": "A prova completa precisa de exatamente uma prova selecionada."}, status=status.HTTP_400_BAD_REQUEST)
            ids = list(queryset.order_by("id").values_list("id", flat=True))
            if not ids:
                return Response({"detail": "Nenhuma questão disponível com esses critérios."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            try:
                count = int(data.get("count") or 0)
            except (TypeError, ValueError):
                count = 0
            if not 1 <= count <= 100:
                return Response({"detail": "Informe a quantidade de questões (1 a 100)."}, status=status.HTTP_400_BAD_REQUEST)
            pool = list(queryset.order_by("id").values_list("id", flat=True))
            if len(pool) < count:
                return Response({"detail": f"Apenas {len(pool)} questões disponíveis com esses critérios."}, status=status.HTTP_400_BAD_REQUEST)
            answered_ids = set(
                UserAnswer.objects.filter(user=request.user, question_id__in=pool)
                .values_list("question_id", flat=True).distinct()
            )
            unseen = [qid for qid in pool if qid not in answered_ids]
            ids = sample(unseen, count) if len(unseen) >= count else sample(pool, count)

        ordered_ids = sorted(ids)
        question_map = Question.objects.filter(pk__in=ordered_ids).select_related("exam").in_bulk()
        ordered_ids = [qid for qid in ordered_ids if qid in question_map]
        now = timezone.now()
        run = SimulationRun.objects.create(
            user=request.user,
            status=SimulationRun.Status.IN_PROGRESS,
            question_ids=ordered_ids,
            question_count=len(ordered_ids),
            time_limit_minutes=time_limit,
            started_at=now,
            discipline=discipline,
            banca=banca,
            year=int(year) if year else None,
            exam_ids=exam_ids,
        )
        def build_payload(q):
            return {
                "id": q.id,
                "exam_id": q.exam_id,
                "exam_title": q.exam.title if q.exam else "",
                "exam_role": q.exam.role if q.exam else "",
                "exam_institution": q.exam.institution if q.exam else "",
                "discipline": q.discipline,
                "banca": q.banca,
                "year": q.year,
                "statement": q.statement,
                "options": q.options,
            }
        return Response({
            "simulation_id": run.id,
            "started_at": now.isoformat(),
            "time_limit_minutes": time_limit,
            "question_count": run.question_count,
            "questions": [build_payload(question_map[qid]) for qid in ordered_ids],
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="submit-simulation")
    def submit_simulation(self, request):
        entries = request.data.get("answers")
        if not isinstance(entries, list) or not entries:
            return Response({"detail": "Envie ao menos uma resposta."}, status=status.HTTP_400_BAD_REQUEST)
        simulation_id = request.data.get("simulation_id")
        run = None
        if simulation_id is not None:
            if not isinstance(simulation_id, int):
                return Response({"detail": "Simulado inválido."}, status=status.HTTP_400_BAD_REQUEST)
            run = SimulationRun.objects.filter(pk=simulation_id, user=request.user).first()
            if run is None:
                return Response({"detail": "Simulado não encontrado."}, status=status.HTTP_400_BAD_REQUEST)
            if run.status != SimulationRun.Status.IN_PROGRESS:
                return Response({"detail": "Simulado já finalizado ou expirado."}, status=status.HTTP_400_BAD_REQUEST)
            if run.time_limit_minutes:
                elapsed = (timezone.now() - run.started_at).total_seconds()
                if elapsed > run.time_limit_minutes * 60:
                    run.status = SimulationRun.Status.EXPIRED
                    run.save(update_fields=["status"])
                    return Response({"detail": "Tempo do simulado esgotado."}, status=status.HTTP_400_BAD_REQUEST)
        max_entries = 200 if run else 50
        if len(entries) > max_entries:
            return Response({"detail": f"Envie no máximo {max_entries} respostas."}, status=status.HTTP_400_BAD_REQUEST)
        question_ids = [entry.get("question_id") for entry in entries if isinstance(entry, dict)]
        if len(question_ids) != len(entries) or any(type(item) is not int for item in question_ids) or len(set(question_ids)) != len(entries):
            return Response({"detail": "Questões inválidas ou repetidas."}, status=status.HTTP_400_BAD_REQUEST)
        if run is not None and not set(question_ids).issubset(run.question_ids):
            return Response({"detail": "Uma ou mais questões não pertencem ao simulado."}, status=status.HTTP_400_BAD_REQUEST)
        questions = Question.objects.filter(pk__in=question_ids, is_active=True).in_bulk()
        if len(questions) != len(entries):
            return Response({"detail": "Uma ou mais questões não estão disponíveis."}, status=status.HTTP_400_BAD_REQUEST)
        validated = []
        for entry in entries:
            question = questions[entry["question_id"]]
            serializer = AnswerSerializer(data={"selected_answer": entry.get("selected_answer")}, context={"question": question})
            serializer.is_valid(raise_exception=True)
            validated.append((question, serializer.validated_data["selected_answer"]))
        with transaction.atomic():
            limit = capabilities_for(request.user)["questions_daily"]
            if limit is not None and UserAnswer.objects.filter(
                user=request.user, created_at__date=timezone.localdate()
            ).count() + len(validated) > limit:
                return Response({"detail": f"Limite diário de {limit} questões atingido para seu plano."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            results = []
            for question, selected in validated:
                answer = UserAnswer.objects.create(
                    user=request.user, question=question, selected_answer=selected,
                    is_correct=selected == question.correct_answer,
                )
                review = schedule_review(request.user, question, answer.is_correct)
                results.append({
                    "question_id": question.id, "attempt_id": answer.id,
                    "selected_answer": selected, "correct_answer": question.correct_answer,
                    "is_correct": answer.is_correct, "explanation": question.explanation,
                    "next_review_at": review.next_review_at,
                })
            simple_answers = [{
                "question_id": item["question_id"],
                "selected_answer": item["selected_answer"],
                "correct_answer": item["correct_answer"],
                "is_correct": item["is_correct"],
            } for item in results]
            if run is None:
                run = SimulationRun.objects.create(
                    user=request.user, status=SimulationRun.Status.FINISHED,
                    score=sum(item["is_correct"] for item in results),
                    total=len(results),
                    question_ids=[item["question_id"] for item in results],
                    question_count=len(results),
                    answers=simple_answers,
                )
            else:
                run.score = sum(item["is_correct"] for item in results)
                run.total = len(results)
                run.status = SimulationRun.Status.FINISHED
                run.finished_at = timezone.now()
                run.duration_seconds = int((timezone.now() - run.started_at).total_seconds())
                run.answers = simple_answers
                run.save()
        return Response({"results": results, "simulation_id": run.id}, status=status.HTTP_201_CREATED)
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        question = self.get_object()
        review, _ = QuestionReview.objects.get_or_create(user=request.user, question=question)
        review.is_marked = not review.is_marked
        review.save(update_fields=["is_marked", "updated_at"])
        return Response({
            "is_marked": review.is_marked,
            "review_due": review.is_marked or bool(review.next_review_at and review.next_review_at <= timezone.now()),
            "next_review_at": review.next_review_at,
        })

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

    @action(detail=True, methods=["post"], url_path="request-explanation")
    def request_explanation(self, request, pk=None):
        question = self.get_object()
        if question.explanation.strip():
            return Response({"detail": "Esta questão já possui comentário."}, status=status.HTTP_400_BAD_REQUEST)
        report, created = ErrorReport.objects.get_or_create(
            user=request.user, question=question,
            description="Solicitação de gabarito comentado.",
            status=ErrorReport.Status.OPEN,
        )
        return Response({"id": report.id, "created": created}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


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
    start_30_days = today - timedelta(days=29)

    answers = UserAnswer.objects.filter(user=request.user)

    # Filtros opcionais (relatórios detalhados)
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")
    discipline = request.query_params.get("discipline")
    banca = request.query_params.get("banca")

    if start_date:
        answers = answers.filter(created_at__date__gte=start_date)
    if end_date:
        answers = answers.filter(created_at__date__lte=end_date)
    if discipline:
        answers = answers.filter(question__discipline__iexact=discipline)
    if banca:
        answers = answers.filter(question__banca__iexact=banca)

    total = answers.count()
    correct = answers.filter(is_correct=True).count()
    incorrect = total - correct
    today_total = answers.filter(created_at__date=today).count()
    last_30 = answers.filter(created_at__date__gte=start_30_days)
    last_30_total = last_30.count()
    last_30_correct = last_30.filter(is_correct=True).count()

    # Período do gráfico diário: intervalo filtrado ou últimos 7 dias
    if start_date or end_date:
        chart_start = start_date or (today - timedelta(days=6)).isoformat()
        chart_end = end_date or today.isoformat()
        if chart_end < chart_start:
            chart_end = chart_start
    else:
        chart_start = (today - timedelta(days=6)).isoformat()
        chart_end = today.isoformat()

    daily_rows = {
        row["day"]: row
        for row in answers.filter(
            created_at__date__gte=chart_start,
            created_at__date__lte=chart_end,
        )
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
        .order_by("day")
    }
    daily = []
    cursor = chart_start
    while cursor <= chart_end:
        row = daily_rows.get(cursor, {})
        day_total = row.get("total", 0)
        day_correct = row.get("correct", 0)
        daily.append({
            "date": cursor,
            "total": day_total,
            "correct": day_correct,
            "accuracy": round(day_correct * 100 / day_total) if day_total else 0,
        })
        cursor = (timezone.datetime.fromisoformat(cursor) + timedelta(days=1)).date().isoformat()

    def breakdown(group_field, label_field):
        rows = list(
            answers.values(group_field)
            .annotate(total=Count("id"), correct=Count("id", filter=Q(is_correct=True)))
            .order_by("-total", group_field)
        )
        for row in rows:
            row[label_field] = row.pop(group_field)
            row["incorrect"] = row["total"] - row["correct"]
            row["accuracy"] = round(row["correct"] * 100 / row["total"])
        return rows

    disciplines = breakdown("question__discipline", "discipline")
    bancas = breakdown("question__banca", "banca")

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
            "banca": answer.question.banca,
            "is_correct": answer.is_correct,
        }
        for answer in answers.select_related("question")[:10]
    ]

    return Response({
        "today_total": today_total,
        "total": total,
        "correct": correct,
        "incorrect": incorrect,
        "accuracy": round(correct * 100 / total) if total else 0,
        "streak": streak,
        "last_30_total": last_30_total,
        "last_30_correct": last_30_correct,
        "last_30_accuracy": round(last_30_correct * 100 / last_30_total) if last_30_total else 0,
        "daily": daily,
        "disciplines": disciplines,
        "bancas": bancas,
        "recent_activity": recent_activity,
        "filters": {
            "start_date": start_date,
            "end_date": end_date,
            "discipline": discipline,
            "banca": banca,
        },
    })


class SimulationTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = SimulationTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SimulationTemplate.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
