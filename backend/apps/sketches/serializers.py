from rest_framework import serializers
from apps.sketches.models import Sketch


class SketchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sketch
        fields = ["id", "title", "data", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"title": {"allow_blank": True}}

    def validate_title(self, value):
        value = value.strip()
        return value or "Rascunho"

    def validate_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Os dados do rascunho devem ser um objeto.")
        return value
