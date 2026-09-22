from rest_framework import serializers

from apps.questions.models import Comment, Exam, Question


class ExamSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)
    disciplines = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            "id", "title", "banca", "institution", "role", "year",
            "question_count", "disciplines",
        ]

    def get_disciplines(self, exam):
        return list(
            exam.questions.filter(is_active=True)
            .order_by("discipline")
            .values_list("discipline", flat=True)
            .distinct()
        )


class QuestionSerializer(serializers.ModelSerializer):
    exam_id = serializers.IntegerField(read_only=True, allow_null=True)
    is_favorite = serializers.BooleanField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)
    latest_answer = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Question
        fields = [
            "id", "exam_id", "discipline", "banca", "year", "statement", "options",
            "is_favorite", "comment_count", "latest_answer",
        ]


class AnswerSerializer(serializers.Serializer):
    selected_answer = serializers.IntegerField(min_value=0)

    def validate_selected_answer(self, value):
        question = self.context["question"]
        if value >= len(question.options):
            raise serializers.ValidationError("Alternativa inválida.")
        return value


class NoteSerializer(serializers.Serializer):
    content = serializers.CharField(allow_blank=True, max_length=10000)


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source="user.get_username", read_only=True)
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ["id", "author", "content", "created_at", "updated_at", "is_owner"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_is_owner(self, comment):
        request = self.context.get("request")
        return bool(request and request.user == comment.user)


class ReportSerializer(serializers.Serializer):
    description = serializers.CharField(min_length=10, max_length=5000)
