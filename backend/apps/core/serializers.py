from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from allauth.socialaccount.models import SocialAccount
from apps.core.models import Profile


BRAZILIAN_STATES = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}


class ProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    username = serializers.CharField(source="user.username", max_length=150)
    first_name = serializers.CharField(
        source="user.first_name", max_length=150, allow_blank=True, required=False
    )
    last_name = serializers.CharField(
        source="user.last_name", max_length=150, allow_blank=True, required=False
    )
    avatar = serializers.SerializerMethodField()
    social_avatar = serializers.SerializerMethodField()
    phone = serializers.CharField(max_length=20, allow_blank=True, required=False)
    state = serializers.CharField(max_length=2, allow_blank=True, required=False)
    city = serializers.CharField(max_length=100, allow_blank=True, required=False)
    profession = serializers.CharField(max_length=120, allow_blank=True, required=False)
    target_role = serializers.CharField(max_length=120, allow_blank=True, required=False)
    study_hours_per_day = serializers.IntegerField(
        min_value=0, max_value=24, required=False
    )
    disciplines = serializers.ListField(
        child=serializers.CharField(max_length=100),
        max_length=30,
        required=False,
    )

    def get_avatar(self, profile):
        if not profile.avatar:
            return None
        request = self.context.get("request")
        url = profile.avatar.url
        return request.build_absolute_uri(url) if request else url

    def get_social_avatar(self, profile):
        account = SocialAccount.objects.filter(
            user=profile.user, provider="google"
        ).first()
        return (account.extra_data or {}).get("picture") if account else None

    def validate_username(self, value):
        queryset = get_user_model().objects.filter(username__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.user_id)
        if queryset.exists():
            raise serializers.ValidationError("Este nome de usuário já está em uso.")
        return value

    def validate_state(self, value):
        value = value.upper()
        if value and value not in BRAZILIAN_STATES:
            raise serializers.ValidationError("Informe uma UF brasileira válida.")
        return value

    def validate_disciplines(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Não repita disciplinas.")
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user = instance.user

        for field in ("username", "first_name", "last_name"):
            if field in user_data:
                setattr(user, field, user_data[field])
        if user_data:
            user.save(update_fields=list(user_data))

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if validated_data:
            instance.save(update_fields=list(validated_data))

        return instance
