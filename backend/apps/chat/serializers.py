from rest_framework import serializers
from apps.chat.models import Conversation, Message, StudyMaterial
from apps.questions.visibility import visible


class MessageSerializer(serializers.ModelSerializer):
    sources = serializers.SerializerMethodField()

    def get_sources(self, obj):
        return [{"id": q.pk, "discipline": q.discipline, "banca": q.banca, "year": q.year,
                 "statement": q.statement[:240]} for q in visible().filter(pk__in=obj.source_question_ids).order_by("pk")[:5]]

    class Meta:
        model = Message
        fields = ["id", "role", "content", "provider", "sources", "created_at"]


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    class Meta:
        model = Conversation
        fields = ["id", "title", "created_at", "updated_at", "messages"]


class SendSerializer(serializers.Serializer):
    content = serializers.CharField(min_length=1, max_length=8000, trim_whitespace=True)
    question_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, max_length=5)
    exam_id = serializers.IntegerField(min_value=1, required=False)


class StudyMaterialSerializer(serializers.ModelSerializer):
    message_id = serializers.IntegerField(write_only=True)
    message = serializers.SerializerMethodField()

    def get_message(self, obj):
        snapshot = Message(pk=obj.message_id or 0, role=Message.Role.ASSISTANT, content=obj.content,
                           provider=obj.provider, source_question_ids=obj.source_question_ids, created_at=obj.created_at)
        return MessageSerializer(snapshot).data

    def create(self, validated_data):
        message = Message.objects.get(pk=validated_data.pop("message_id"))
        return StudyMaterial.objects.create(message=message, content=message.content, provider=message.provider,
                                            source_question_ids=message.source_question_ids, **validated_data)

    class Meta:
        model = StudyMaterial
        fields = ["id", "title", "message_id", "message", "created_at"]

    def validate_message_id(self, value):
        message = Message.objects.filter(pk=value, conversation__user=self.context["request"].user,
                                         role=Message.Role.ASSISTANT).first()
        if not message:
            raise serializers.ValidationError("Resposta não encontrada.")
        if StudyMaterial.objects.filter(message=message).exists():
            raise serializers.ValidationError("Esta resposta já está na biblioteca.")
        return value
