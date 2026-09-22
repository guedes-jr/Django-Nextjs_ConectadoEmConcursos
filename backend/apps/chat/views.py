from django.conf import settings
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.chat.models import ChatUsage, Conversation, Message
from apps.chat.serializers import ConversationSerializer, MessageSerializer, SendSerializer
from apps.chat.services import build_study_context, generate_response
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
            study_context = build_study_context(
                serializer.validated_data.get("question_ids"), serializer.validated_data.get("exam_id")
            )
            answer, provider, usage = generate_response(request.user, context, study_context)
        except Exception:
            return Response({"detail": "O serviço de IA está temporariamente indisponível.", "user_message": MessageSerializer(user_message).data}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        assistant = Message.objects.create(conversation=conversation, role=Message.Role.ASSISTANT, content=answer, provider=provider)
        ChatUsage.objects.create(
            user=request.user,
            conversation=conversation,
            provider=provider,
            model=settings.OPENAI_MODEL if provider == "openai" else "local",
            **usage,
        )
        return Response({"user_message": MessageSerializer(user_message).data, "assistant_message": MessageSerializer(assistant).data}, status=status.HTTP_201_CREATED)
