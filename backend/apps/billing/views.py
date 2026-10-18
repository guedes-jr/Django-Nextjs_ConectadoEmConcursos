from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .checkout import cancel_subscription, expire_checkout, select_plan
from .models import Plan, Subscription
from .serializers import PlanSerializer, SubscribeSerializer, SubscriptionSerializer
from .stripe_gateway import verify_event
from .webhooks import process_event


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def plans(request):
    return Response(PlanSerializer(Plan.objects.filter(is_active=True, status=Plan.Status.PUBLISHED), many=True).data)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def subscription(request):
    if request.method == "GET":
        current = Subscription.objects.filter(user=request.user).select_related("plan").first()
        return Response(SubscriptionSerializer(current).data if current else None)
    serializer = SubscribeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    plan = get_object_or_404(Plan, slug=serializer.validated_data["plan"], is_active=True, status=Plan.Status.PUBLISHED)
    sub, attempt = select_plan(request.user, plan, serializer.validated_data["cycle"], request=request)
    detail = "Plano gratuito ativado."
    if attempt:
        detail = "Checkout expirado. Selecione o plano novamente." if attempt.status == "expired" else "Aguarde a confirmação do pagamento. O retorno do checkout não ativa o plano."
    return Response({"subscription": SubscriptionSerializer(sub).data if sub else None,
                     "checkout_required": bool(attempt), "checkout_url": attempt.checkout_url if attempt and attempt.status == "open" else None,
                     "checkout_status": attempt.status if attempt else None,
                     "detail": detail},
                    status=status.HTTP_202_ACCEPTED if attempt else status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def cancel(request):
    return Response(SubscriptionSerializer(cancel_subscription(request.user, request=request)).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def expire(request):
    expire_checkout(request.user, request=request)
    return Response({"detail": "Checkout pendente encerrado."})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def stripe_webhook(request):
    try:
        length = int(request.META.get("CONTENT_LENGTH") or 0)
    except ValueError as exc:
        raise ValidationError("Tamanho de evento inválido.") from exc
    if length > 262144:
        return Response({"detail": "Evento excede o limite."}, status=413)
    body = request.body
    if len(body) > 262144:
        return Response({"detail": "Evento excede o limite."}, status=413)
    event = verify_event(body, request.headers.get("Stripe-Signature", ""))
    return Response({"outcome": process_event(event)})
