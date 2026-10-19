from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from apps.questions.visibility import visible
from apps.workspace.models import SimulationRun
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.chat.models import ChatUsage, Conversation, Message
from apps.chat.serializers import ConversationSerializer, MessageSerializer, SendSerializer
from apps.chat.services import build_study_context, generate_response, search_related_questions
from apps.billing.services import capabilities_for


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return Conversation.objects.filter(user=self.request.user).prefetch_related("messages")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        conversation = self.get_object()
        serializer = SendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        capabilities = capabilities_for(request.user)
        if (serializer.validated_data.get("question_ids") or serializer.validated_data.get("exam_id")) and not capabilities["advanced_tools"]:
            return Response(
                {"detail": "O contexto de provas e questões está disponível no plano Avançado."},
                status=status.HTTP_403_FORBIDDEN,
            )
        used_today = ChatUsage.objects.filter(user=request.user, created_at__date=timezone.localdate()).count()
        if used_today >= capabilities["chat_daily"]:
            return Response(
                {"detail": f"Limite diário de {capabilities['chat_daily']} mensagens atingido para seu plano."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        user_message = Message.objects.create(conversation=conversation, role=Message.Role.USER, content=content)
        if Message.objects.filter(conversation=conversation).count() == 1:
            conversation.title = content[:117] + ("…" if len(content) > 117 else "")
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=["title", "updated_at"])
        context = list(conversation.messages.values("role", "content").order_by("-created_at")[:20])
        context.reverse()
        try:
            related = search_related_questions(
                content, serializer.validated_data.get("question_ids"), serializer.validated_data.get("exam_id")
            )
            study_context = build_study_context(exam_id=serializer.validated_data.get("exam_id"), questions=related)
            answer, provider, usage = generate_response(request.user, context, study_context)
        except Exception:
            return Response({"detail": "O serviço de IA está temporariamente indisponível.", "user_message": MessageSerializer(user_message).data}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        assistant = Message.objects.create(conversation=conversation, role=Message.Role.ASSISTANT, content=answer, provider=provider, source_question_ids=[q.pk for q in related])
        ChatUsage.objects.create(
            user=request.user,
            conversation=conversation,
            provider=provider,
            model=usage.pop("model", settings.OPENAI_MODEL if provider == "openai" else "local"),
            **usage,
        )
        return Response({"user_message": MessageSerializer(user_message).data, "assistant_message": MessageSerializer(assistant).data}, status=status.HTTP_201_CREATED)


    @action(detail=True, methods=["post"])
    def practice(self, request, pk=None):
        conversation = self.get_object()
        message_id = request.data.get("message_id")
        if type(message_id) is not int:
            raise ValidationError({"message_id": "Informe uma resposta válida."})
        message = conversation.messages.filter(pk=message_id, role=Message.Role.ASSISTANT).first()
        if not message:
            return Response({"detail": "Resposta não encontrada."}, status=404)
        questions = list(visible().filter(pk__in=message.source_question_ids).select_related("exam").order_by("pk")[:5])
        if not questions:
            return Response({"detail": "Nenhuma questão desta resposta está disponível para praticar."}, status=400)
        now = timezone.now()
        run = SimulationRun.objects.create(user=request.user, question_ids=[q.pk for q in questions],
                                           question_count=len(questions), started_at=now)
        return Response({"simulation_id": run.pk, "started_at": now.isoformat(), "time_limit_minutes": None,
                         "question_count": len(questions), "questions": [
            {"id": q.pk, "exam_id": q.exam_id, "exam_title": q.exam.title if q.exam else "",
             "exam_role": q.exam.role if q.exam else "", "exam_institution": q.exam.institution if q.exam else "",
             "discipline": q.discipline, "banca": q.banca, "year": q.year,
             "statement": q.statement, "options": q.options} for q in questions]}, status=201)
