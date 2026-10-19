from rest_framework import serializers
from apps.chat.models import Conversation, Message
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
