from django.contrib.auth import get_user_model
from rest_framework import serializers
from dj_rest_auth.serializers import LoginSerializer


class LoginWithBlockStatusSerializer(LoginSerializer):
    """Informa bloqueio somente depois de confirmar a senha informada."""

    def validate(self, attrs):
        email = str(attrs.get("email", "")).strip()
        password = attrs.get("password", "")
        if email and password:
            user = get_user_model().objects.filter(email__iexact=email, is_active=False).first()
            if user and user.check_password(password):
                raise serializers.ValidationError({
                    "detail": ["Esta conta está bloqueada. Entre em contato com o suporte para mais informações."],
                    "code": ["account_blocked"],
                })
        return super().validate(attrs)
