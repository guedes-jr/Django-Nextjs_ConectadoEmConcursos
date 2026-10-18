"""Financial aggregates from confirmed receipts; never infer cash from catalog prices."""
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.billing.models import BillingCheckout, PaymentEvent, Subscription

PAID_TYPES = [PaymentEvent.Type.SUCCEEDED, PaymentEvent.Type.RENEWED]
DIVISORS = {"mensal": 1, "semestral": 6, "anual": 12}
MAX_GROUPS = 200
VALID_RECEIPT = Q(processed=True, amount_minor__isnull=False, paid_at__isnull=False, currency="brl") & ~Q(invoice_id="")


def money(minor):
    return str((Decimal(minor) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def percent(current, previous):
    if current is None or previous in (None, "0.00"):
        return None
    return float(((Decimal(current) - Decimal(previous)) / Decimal(previous) * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def receipt_summary(since, until):
    candidates = PaymentEvent.objects.filter(type__in=PAID_TYPES).filter(
        Q(paid_at__gte=since, paid_at__lt=until) | Q(paid_at__isnull=True, created_at__gte=since, created_at__lt=until)
    )
    receipts = candidates.filter(VALID_RECEIPT)
    totals = receipts.aggregate(count=Count("id"), minor=Sum("amount_minor"))
    excluded = candidates.exclude(VALID_RECEIPT).count()
    count, minor = totals["count"], totals["minor"] or 0
    revenue = money(minor) if count or not excluded else None
    return receipts, {
        "received_revenue": revenue,
        "payments_count": count,
        "excluded_receipts": excluded,
        "coverage": "partial" if excluded and count else "unavailable" if excluded else "recorded",
        "average_ticket_received": money(Decimal(minor) / count) if count else None,
    }


def financial_report(since, until, *, now=None):
    now = now or timezone.now()
    receipts, current = receipt_summary(since, until)
    _, previous = receipt_summary(since - (until - since), since)
    # This is a present-day snapshot. Historical subscription states cannot be
    # reconstructed reliably from today's one-to-one subscription record.
    active = Subscription.objects.filter(
        status="active", gateway="stripe", provider_status__in=["active", "past_due"],
        current_period_end__gt=now, price_amount_minor__gt=0, currency="brl",
    ).exclude(provider_subscription_id="")
    recurring = active.filter(cancel_at_period_end=False, provider_status="active", cycle__in=DIVISORS)
    recurring_count = recurring.count()
    mrr_minor = sum((Decimal(row["minor"]) / DIVISORS[row["cycle"]] for row in
                     recurring.values("cycle").annotate(minor=Sum("price_amount_minor"))), Decimal(0))
    events = PaymentEvent.objects.filter(processed=True).annotate(
        effective_at=Coalesce("provider_created_at", "created_at")
    ).filter(effective_at__gte=since, effective_at__lt=until)
    grouped_receipts = list(receipts.values("plan_slug", "plan_name", "billing_cycle").annotate(
        count=Count("id"), minor=Sum("amount_minor")
    ).order_by("plan_slug", "plan_name", "billing_cycle")[:MAX_GROUPS + 1])
    grouped_subscriptions = list(active.values("plan__name", "cycle").annotate(
        count=Count("id")
    ).order_by("plan__name", "cycle")[:MAX_GROUPS + 1])
    by_plan_cycle = [
        {"plan_slug": row["plan_slug"], "plan_name": row["plan_name"] or "Não identificado",
         "cycle": row["billing_cycle"] or "unknown", "payments_count": row["count"], "received_revenue": money(row["minor"])}
        for row in grouped_receipts[:MAX_GROUPS]
    ]
    daily = [
        {"date": row["date"], "payments_count": row["count"], "received_revenue": money(row["minor"])}
        for row in receipts.annotate(date=TruncDate("paid_at", tzinfo=timezone.get_current_timezone())).values("date").annotate(count=Count("id"), minor=Sum("amount_minor")).order_by("date")
    ]
    return {
        "access_granted": True, "currency": "BRL", "snapshot_at": now,
        **current,
        "previous_received_revenue": previous["received_revenue"],
        "previous_payments_count": previous["payments_count"],
        "previous_excluded_receipts": previous["excluded_receipts"],
        "previous_coverage": previous["coverage"],
        "received_revenue_change_percent": percent(current["received_revenue"], previous["received_revenue"]) if not current["excluded_receipts"] and not previous["excluded_receipts"] else None,
        "received_revenue_status": "Soma dos recibos confirmados BRL por data de pagamento. Registros incompletos ou de outra moeda são excluídos e sinalizados; não representa receita líquida de estornos, taxas ou impostos.",
        "mrr": money(mrr_minor), "arr": money(mrr_minor * 12),
        "active_subscriptions": active.count(),
        "recurring_subscriptions": recurring_count,
        "scheduled_cancellations": active.filter(cancel_at_period_end=True).count(),
        "past_due_subscriptions": Subscription.objects.filter(gateway="stripe", provider_status__in=["past_due", "unpaid"]).count(),
        "pending_subscriptions": Subscription.objects.filter(status="pending_payment").count(),
        "pending_checkouts": BillingCheckout.objects.filter(status__in=["creating", "open", "processing"]).count(),
        "new_paid_subscriptions": receipts.filter(type=PaymentEvent.Type.SUCCEEDED).count(),
        "renewals": receipts.filter(type=PaymentEvent.Type.RENEWED).count(),
        "canceled_subscriptions": events.filter(type=PaymentEvent.Type.CANCELED).count(),
        "payments_failed": events.filter(type=PaymentEvent.Type.FAILED).count(),
        "reactivations": None,
        "average_ticket_mrr": money(mrr_minor / recurring_count) if recurring_count else None,
        "plan_distribution": [
            {"plan": row["plan__name"], "cycle": row["cycle"], "count": row["count"]}
            for row in grouped_subscriptions[:MAX_GROUPS]
        ],
        "revenue_by_plan_cycle": by_plan_cycle, "daily_revenue": daily,
        "groups_limit": MAX_GROUPS,
        "revenue_groups_truncated": len(grouped_receipts) > MAX_GROUPS,
        "distribution_truncated": len(grouped_subscriptions) > MAX_GROUPS,
        "definitions": {
            "received_revenue": "Fluxo de caixa registrado: soma amount_minor dos recibos processados payment.succeeded/subscription.renewed, com fatura, paid_at e moeda BRL. Intervalo [início, fim).",
            "comparison": "Período anterior adjacente de mesma duração. Variação indisponível quando a base é zero ou algum período possui exclusões. Compare também a cobertura dos dois períodos.",
            "coverage": "recorded = todos os recibos pagos registrados no período têm valor BRL; partial = soma conhecida com exclusões; unavailable = só há registros excluídos. Ausência de eventos externos não pode ser detectada por este relatório.",
            "mrr": "Fotografia atual de assinaturas Stripe ativas, pagas, não vencidas, em BRL, com preço confirmado e renovação habilitada. Valor contratado do ciclo / 1, 6 ou 12 meses; ARR = MRR × 12 antes do arredondamento monetário. Não inclui concessões locais, atrasos ou cancelamento agendado.",
            "active_subscriptions": "Assinaturas Stripe pagas BRL com acesso vigente agora, incluindo cancelamento agendado e atraso ainda coberto por período pago. Não é uma reconstrução histórica.",
            "new_paid_subscriptions": "Faturas iniciais confirmadas no período de pagamento, inclusive quando a assinatura foi cancelada posteriormente. Renovações não são reativações.",
            "attribution": "Plano/nome/ciclo são snapshots no recibo. Recibos anteriores sem snapshot ficam em Não identificado; não são reclassificados pela assinatura atual.",
            "unavailable": "Reativações, conversão histórica pendente → ativa, descontos, reembolsos e chargebacks não possuem fonte persistida suficiente; não são estimados.",
        },
    }
