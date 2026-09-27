"""Ordem de prioridade da fila de curadoria.

Fica num módulo próprio porque o admin e a API de conteúdo precisam mostrar a
fila na **mesma** ordem: se divergirem, o admin revisa uma questão e a API
entrega outra.
"""

from django.db.models import Case, Count, IntegerField, Q, Value, When

from .models import Question

# A fila é trabalho pendente: pendente vem primeiro, depois o que o aluno mais
# reclamou e o que ele mais errou — é a ordem em que a curadoria rende mais.
QUEUE_STATUS_ORDER = (
    (Question.Status.PENDING, 0),
    (Question.Status.REJECTED, 1),
    (Question.Status.APPROVED, 2),
)

# `error_count` e `comment_requests_count` só existem como annotation.
QUEUE_PRIORITY_ORDER = [
    "status_order",
    "-comment_requests_count",
    "-error_count",
    "id",
]

COMMENT_REQUEST_DESCRIPTION = "Solicitação de gabarito comentado."


def annotate_queue_priority(queryset):
    """Adiciona as contagens e o peso de status usados pela ordenação da fila."""
    return queryset.annotate(
        status_order=Case(
            *[
                When(status=state, then=Value(position))
                for state, position in QUEUE_STATUS_ORDER
            ],
            output_field=IntegerField(),
        ),
        error_count=Count("answers", filter=Q(answers__is_correct=False), distinct=True),
        comment_requests_count=Count(
            "error_reports",
            filter=Q(error_reports__description=COMMENT_REQUEST_DESCRIPTION),
            distinct=True,
        ),
    )
