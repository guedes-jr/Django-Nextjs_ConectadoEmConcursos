from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.billing.models import Plan, Subscription


class PlanSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=Plan.Status.choices, default=Plan.Status.DRAFT)
    features = serializers.ListField(child=serializers.CharField(allow_blank=False), required=False)

    def validate(self, attrs):
        errors = {}
        for field in ("monthly_price", "semiannual_price", "annual_price"):
            if field in attrs and attrs[field] < 0:
                errors[field] = "Informe um preço maior ou igual a zero."
        if errors:
            raise serializers.ValidationError(errors)
        current_status = attrs.get("status", self.instance.status if self.instance else Plan.Status.DRAFT)
        if current_status != Plan.Status.PUBLISHED:
            attrs["is_active"] = False
        return attrs

    class Meta:
        model = Plan
        fields = ["id", "slug", "name", "description", "monthly_price", "semiannual_price", "annual_price", "features", "status", "is_highlighted", "trial_days", "is_active", "sort_order"]


class SubscriptionAdminSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    plan_slug = serializers.CharField(source="plan.slug", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)

    class Meta:
        model = Subscription
        fields = ["id", "user_id", "username", "email", "plan_slug", "plan_name", "cycle", "status", "gateway", "current_period_end", "created_at", "updated_at"]

class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    email = serializers.EmailField(max_length=254)

    class Meta:
        model = get_user_model()
        fields = ["username", "email", "first_name", "last_name", "password"]

    def validate_email(self, value):
        value = value.strip().lower()
        if self.Meta.model.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Já existe um usuário com este e-mail.")
        return value

    def validate(self, attrs):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(attrs["password"], self.Meta.model(**{k: v for k, v in attrs.items() if k != "password"}))
        except ValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages})
        return attrs

    def create(self, validated_data):
        return self.Meta.model.objects.create_user(**validated_data)


class StaffCreateSerializer(UserCreateSerializer):
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)

    def validate_email(self, value):
        return super().validate_email(value) if value else ""


class EditorialConcursoSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=["expected", "open", "closed"], default="expected")
    class Meta:
        from apps.concursos.models import Concurso
        model = Concurso
        fields = ["title", "organization", "state", "status", "source_url", "editorial_status"]

    def validate_state(self, value):
        if value and (len(value) != 2 or not value.isascii() or not value.isalpha()):
            raise serializers.ValidationError("Informe uma UF com duas letras.")
        return value.upper()


class EditorialExamSerializer(serializers.ModelSerializer):
    year = serializers.IntegerField(min_value=1980, max_value=2100)
    is_published = serializers.BooleanField(default=False)

    class Meta:
        from apps.questions.models import Exam
        model = Exam
        fields = ["title", "banca", "institution", "role", "year", "level", "state", "is_published", "concurso"]

    def validate_state(self, value):
        return EditorialConcursoSerializer().validate_state(value)


class EditorialArticleSerializer(serializers.ModelSerializer):
    editorial_status = serializers.ChoiceField(choices=["draft", "scheduled", "published", "archived"], default="draft")
    body = serializers.CharField(allow_blank=False)
    tags = serializers.ListField(child=serializers.CharField(max_length=100), required=False)

    class Meta:
        from apps.concursos.models import NewsArticle
        model = NewsArticle
        fields = ["title", "slug", "summary", "body", "category", "image_url", "seo_title", "seo_description", "tags", "is_featured", "is_pinned", "editorial_status", "scheduled_for"]

    def validate(self, attrs):
        from django.utils import timezone
        current_status = attrs.get("editorial_status", self.instance.editorial_status if self.instance else "draft")
        if current_status == "scheduled":
            when = attrs.get("scheduled_for", self.instance.scheduled_for if self.instance else None)
            if not when or when <= timezone.now():
                raise serializers.ValidationError({"scheduled_for": "Informe uma data futura para agendar."})
        return attrs
