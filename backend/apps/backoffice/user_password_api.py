"""Redefinição direta de credenciais por administradores, sem depender de e-mail."""
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .audit import log
from .permissions import Administrator


class PasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=4096)
    confirmation = serializers.CharField(write_only=True, trim_whitespace=False, max_length=4096)
    reason = serializers.CharField(max_length=500)

    def validate(self, data):
        if data['new_password'] != data['confirmation']:
            raise serializers.ValidationError({'confirmation': 'As senhas não coincidem.'})
        user = self.context['user']
        try:
            validate_password(data['new_password'], user)
        except ValidationError as exc:
            raise serializers.ValidationError({'new_password': exc.messages}) from exc
        if user.check_password(data['new_password']):
            raise serializers.ValidationError({'new_password': 'Escolha uma senha diferente da atual.'})
        return data


@api_view(['POST'])
@permission_classes([Administrator])
def reset_password(request, pk):
    with transaction.atomic():
        user = get_object_or_404(get_user_model().objects.select_for_update(), pk=pk)
        if (user.is_staff or user.is_superuser) and not request.user.is_superuser:
            return Response({'detail': 'Apenas superusuários podem redefinir a senha de contas administrativas.'}, status=403)
        serializer = PasswordSerializer(data=request.data, context={'user': user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        revoked = 0
        for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
            if str(session.get_decoded().get('_auth_user_id')) == str(user.pk):
                session.delete()
                revoked += 1
        Token.objects.filter(user=user).delete()
        log(request, action='user.password_changed_by_admin', resource_type='user', resource_id=user.pk,
            reason=serializer.validated_data['reason'], after={'sessions_revoked': revoked})
    return Response({'ok': True, 'reauthenticate': request.user.pk == user.pk})
