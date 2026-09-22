from rest_framework import serializers
from apps.chat.models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["id", "role", "content", "provider", "created_at"]


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    class Meta:
        model = Conversation
        fields = ["id", "title", "created_at", "updated_at", "messages"]


class SendSerializer(serializers.Serializer):
    content = serializers.CharField(min_length=1, max_length=8000, trim_whitespace=True)
    question_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, max_length=5)
    exam_id = serializers.IntegerField(min_value=1, required=False)
