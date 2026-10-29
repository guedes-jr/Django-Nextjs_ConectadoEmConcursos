import logging
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import permissions, status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import Profile
from apps.core.serializers import ProfileSerializer
from apps.core.email_delivery import send_password_reset_link


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    profile, _ = Profile.objects.get_or_create(user=request.user)
    if request.method == "PATCH":
        serializer = ProfileSerializer(
            profile,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
    else:
        serializer = ProfileSerializer(profile, context={"request": request})
    return Response(serializer.data)

@api_view(["GET"])
@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({"ok": True})

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_avatar(request):
    file = request.FILES.get("avatar")
    if not file:
        return Response({"avatar": ["Envie o arquivo no campo avatar."]}, status=400)

    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.avatar = file
    profile.save(update_fields=["avatar"])
    return Response({
        "ok": True,
        "avatar": request.build_absolute_uri(profile.avatar.url),
    })


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def password_reset_request(request):
    email = str(request.data.get("email", "")).strip()
    try:
        validate_email(email)
    except DjangoValidationError:
        return Response({"detail": "Se o e-mail existir, enviaremos as instruções."})
    user = get_user_model().objects.filter(email__iexact=email, is_active=True).first()
    if user:
        try:
            send_password_reset_link(user)
        except Exception as exc:
            logging.getLogger(__name__).error("Falha de entrega de recuperação de senha (%s).", type(exc).__name__)
    return Response({"detail": "Se o e-mail existir, enviaremos as instruções."})


def _validate_new_password(user, password):
    try:
        password_validation.validate_password(password, user=user)
    except ValidationError as exc:
        return list(exc.messages)
    return []


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def password_reset_confirm(request):
    try:
        user_id = force_str(urlsafe_base64_decode(request.data.get("uid", "")))
        user = get_user_model().objects.get(pk=user_id, is_active=True)
    except (TypeError, ValueError, OverflowError, get_user_model().DoesNotExist):
        return Response({"token": ["Link inválido ou expirado."]}, status=status.HTTP_400_BAD_REQUEST)
    token = request.data.get("token", "")
    if not default_token_generator.check_token(user, token):
        return Response({"token": ["Link inválido ou expirado."]}, status=status.HTTP_400_BAD_REQUEST)
    password = request.data.get("new_password", "")
    errors = _validate_new_password(user, password)
    if errors:
        return Response({"new_password": errors}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(password)
    user.save(update_fields=["password"])
    return Response({"detail": "Senha redefinida com sucesso."})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def change_password(request):
    if not request.user.check_password(request.data.get("current_password", "")):
        return Response({"current_password": ["Senha atual incorreta."]}, status=status.HTTP_400_BAD_REQUEST)
    password = request.data.get("new_password", "")
    errors = _validate_new_password(request.user, password)
    if errors:
        return Response({"new_password": errors}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(password)
    request.user.save(update_fields=["password"])
    return Response({"detail": "Senha alterada com sucesso."})
