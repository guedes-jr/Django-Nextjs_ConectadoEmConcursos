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
        fields = ["title", "organization", "state", "status", "source_url", "editorial_status", "banca", "official_url", "description"]

    def validate_official_url(self, value):
        if value and not value.lower().startswith(("http://", "https://")):
            raise serializers.ValidationError("Use uma URL HTTP(S).")
        return value

    def validate_banca(self, value):
        if value and not value.is_active and (not self.instance or self.instance.banca_id != value.id):
            raise serializers.ValidationError("Selecione uma banca ativa.")
        if value and self.instance and self.instance.exams.exclude(banca_catalog__isnull=True).exclude(banca_catalog=value).exists():
            raise serializers.ValidationError("Há provas vinculadas a outra banca. Confira os vínculos antes de alterar o concurso.")
        return value

    def validate_state(self, value):
        if value and (len(value) != 2 or not value.isascii() or not value.isalpha()):
            raise serializers.ValidationError("Informe uma UF com duas letras.")
        return value.upper()


class EditorialExamSerializer(serializers.ModelSerializer):
    banca = serializers.CharField(required=False)
    year = serializers.IntegerField(min_value=1980, max_value=2100)
    is_published = serializers.BooleanField(default=False)

    class Meta:
        from apps.questions.models import Exam
        model = Exam
        fields = ["title", "banca", "institution", "role", "year", "level", "state", "is_published", "concurso", "banca_catalog"]

    def to_internal_value(self, data):
        # A unicidade título/banca/ano é validada pelo DRF antes de validate().
        if data.get("banca_catalog") and not data.get("banca"):
            from apps.questions.models import BancaCatalog
            value = str(data["banca_catalog"])
            selected = BancaCatalog.objects.filter(pk=int(value)).first() if value.isdigit() else None
            if selected:
                data = data.copy()
                data["banca"] = selected.name
        return super().to_internal_value(data)

    def validate(self, attrs):
        from apps.questions.naming import resolve_banca_catalog
        selected = attrs.get("banca_catalog")
        text = attrs.get("banca")
        if selected:
            if not selected.is_active and (not self.instance or self.instance.banca_catalog_id != selected.id):
                raise serializers.ValidationError({"banca_catalog": "Selecione uma banca ativa."})
            if text and (resolved := resolve_banca_catalog(text)) and resolved.pk != selected.pk:
                raise serializers.ValidationError({"banca": "Nome e catálogo indicam bancas diferentes."})
            attrs["banca"] = selected.name
        elif text:
            attrs["banca_catalog"] = resolve_banca_catalog(text)
        if not self.instance and not attrs.get("banca"):
            raise serializers.ValidationError({"banca": "Selecione uma banca ou informe o identificador histórico."})
        selected = attrs.get("banca_catalog", self.instance.banca_catalog if self.instance else None)
        concurso = attrs.get("concurso", self.instance.concurso if self.instance else None)
        if selected:
            from apps.questions.models import Exam
            from apps.questions.naming import banca_query
            title = attrs.get("title", self.instance.title if self.instance else "")
            year = attrs.get("year", self.instance.year if self.instance else None)
            duplicates = Exam.objects.filter(title=title, year=year).filter(banca_query(selected.name))
            if self.instance:
                duplicates = duplicates.exclude(pk=self.instance.pk)
            if duplicates.exists():
                raise serializers.ValidationError({"title": "Já existe uma prova com este título, banca e ano, inclusive nas grafias alternativas."})
        if self.instance and "concurso" in attrs and self.instance.resources.exclude(concurso=concurso).exists():
            raise serializers.ValidationError({"concurso": "A prova possui materiais no concurso atual. Ajuste os materiais antes de mudar o vínculo."})
        if selected and concurso and concurso.banca_id and selected.pk != concurso.banca_id:
            raise serializers.ValidationError({"concurso": "O concurso está vinculado a outra banca. Confira os dados antes de associar."})
        return attrs

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
