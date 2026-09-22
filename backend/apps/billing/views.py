from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.billing.models import Plan, Subscription
from apps.billing.serializers import PlanSerializer, SubscribeSerializer, SubscriptionSerializer


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def plans(request):
    return Response(PlanSerializer(Plan.objects.filter(is_active=True), many=True).data)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def subscription(request):
    current = Subscription.objects.filter(user=request.user).select_related("plan").first()
    if request.method == "GET":
        return Response(SubscriptionSerializer(current).data if current else None)
    serializer = SubscribeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    plan = get_object_or_404(Plan, slug=serializer.validated_data["plan"], is_active=True)
    is_free = plan.monthly_price == 0
    subscription, _ = Subscription.objects.update_or_create(
        user=request.user,
        defaults={"plan": plan, "cycle": serializer.validated_data["cycle"], "status": Subscription.Status.ACTIVE if is_free else Subscription.Status.PENDING},
    )
    response_status = status.HTTP_200_OK if is_free else status.HTTP_202_ACCEPTED
    return Response({"subscription": SubscriptionSerializer(subscription).data, "checkout_required": not is_free, "detail": None if is_free else "Gateway de pagamento ainda não configurado; nenhuma cobrança foi realizada."}, status=response_status)
