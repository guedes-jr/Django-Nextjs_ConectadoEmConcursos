from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.billing.models import Plan, Subscription
from .models import AdminNotification


class WebURLField(serializers.URLField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if urlparse(value).scheme.lower() not in {"http", "https"}:
            raise serializers.ValidationError("Use uma URL HTTP(S).")
        return value


class NoticeLinkSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=160)
    url = WebURLField(max_length=2048)


class AdminNotificationInputSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160, required=False)
    summary = serializers.CharField(max_length=280, required=False, allow_blank=True)
    body = serializers.CharField(required=False, allow_blank=True)
    priority = serializers.ChoiceField(choices=AdminNotification.Priority.choices, required=False)
    scope = serializers.ChoiceField(choices=AdminNotification.Scope.choices, required=False)
    segment_plan_slug = serializers.SlugField(required=False, allow_blank=True)
    segment_subscription_status = serializers.ChoiceField(choices=["", *Subscription.Status.values], required=False)
    image_url = WebURLField(max_length=200, required=False, allow_blank=True)
    video_url = WebURLField(max_length=200, required=False, allow_blank=True)
    links = NoticeLinkSerializer(many=True, required=False, max_length=10)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    postpone_hours = serializers.IntegerField(min_value=1, max_value=8760, required=False)
    max_postpones = serializers.IntegerField(min_value=0, max_value=100, required=False)
    selected_user_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, max_length=10000)

    def validate_body(self, value):
        if "<" in value or ">" in value:
            raise serializers.ValidationError("Use texto simples; HTML não é permitido.")
        return value

    def validate_video_url(self, value):
        host = urlparse(value).hostname or ""
        if value and not any(host == domain or host.endswith("." + domain) for domain in ("youtube.com", "youtu.be", "vimeo.com")):
            raise serializers.ValidationError("Use um vídeo hospedado em YouTube ou Vimeo.")
        return value

    def validate(self, attrs):
        existing = self.context.get("existing")
        def field(name, default=None):
            return attrs.get(name, getattr(existing, name, default))
        errors = {}
        if not field("title"):
            errors["title"] = "Informe um título."
        scope = field("scope", AdminNotification.Scope.SELECTED)
        if scope == AdminNotification.Scope.SEGMENT:
            plan = field("segment_plan_slug", "")
            if not plan and not field("segment_subscription_status", ""):
                errors["scope"] = "Selecione um plano ou status de assinatura."
            if plan and not Plan.objects.filter(slug=plan, is_active=True).exists():
                errors["segment_plan_slug"] = "Plano ativo não encontrado."
        ids = attrs.get("selected_user_ids")
        if scope == AdminNotification.Scope.SELECTED:
            if ids is None and not existing:
                errors["selected_user_ids"] = "Selecione ao menos um usuário ativo."
            elif ids is not None and (not ids or get_user_model().objects.filter(pk__in=ids, is_active=True).count() != len(set(ids))):
                errors["selected_user_ids"] = "Selecione apenas usuários ativos e válidos."
        if field("starts_at") and field("ends_at") and field("ends_at") <= field("starts_at"):
            errors["ends_at"] = "O término deve ser posterior ao início."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
