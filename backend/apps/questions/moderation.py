"""Único ponto de escrita do fluxo de aprovação de uma questão.

Publicar ou rejeitar é decisão editorial com rastro de auditoria, então as três
ações moram aqui e nenhuma delas aceita status pronto: quem chama escolhe entre
`approve`, `reject` e `reopen`. O `is_active` é sempre derivado do `status` por
`sync_visibility`, é ele que segura a leitura dos 11 pontos de query da app —
por isso as ações nunca setam o campo na mão.
"""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.questions.models import Question

MIN_EXPLANATION_CHARS = 120

REJECTION_REASONS = {
    "gabarito_errado": "Gabarito errado",
    "enunciado_com_erro": "Enunciado com erro",
    "duplicada": "Duplicada",
    "sem_gabarito_na_fonte": "Sem gabarito na fonte",
    "licenca_direitos": "Licença/direitos",
    "fora_do_escopo": "Fora do escopo",
}

REVIEW_FIELDS = [
    "explanation",
    "status",
    "reviewed_by",
    "reviewed_at",
    "review_note",
    "rejection_reason",
    "rejection_reason_code",
]


def sync_visibility(question, save: bool = True):
    """Deixa `is_active` sempre igual a "aprovada" e grava a mudança."""
    question.is_active = question.status == Question.Status.APPROVED
    if save:
        question.save(update_fields=["is_active", "updated_at"])
    return question


def approve(question, reviewer, explanation=None):
    """Aprova e publica a questão.

    A explicação curada é obrigatória: é ela que o aluno lê depois de errar. Sem
    `explanation`, vale a que já está no banco — mas ela também precisa ter o
    tamanho mínimo, senão o caminho "aprovar sem mexer no texto" burlaria a regra.
    """
    text = question.explanation if explanation is None else explanation
    text = (text or "").strip()
    if len(text) < MIN_EXPLANATION_CHARS:
        raise ValidationError(
            {
                "explanation": [
                    f"A explicação precisa ter pelo menos {MIN_EXPLANATION_CHARS} caracteres "
                    f"(tem {len(text)})."
                ]
            }
        )
    with transaction.atomic():
        question.explanation = text
        question.status = Question.Status.APPROVED
        question.reviewed_by = reviewer
        question.reviewed_at = timezone.now()
        question.review_note = ""
        question.rejection_reason = ""
        question.rejection_reason_code = ""
        sync_visibility(question, save=False)
        question.save(update_fields=[*REVIEW_FIELDS, "is_active", "updated_at"])
    return question


def reject(question, reviewer, reason, reason_code):
    """Rejeita a questão, tirando-a da leitura dos alunos.

    `reason_code` é o motivo estruturado (o que o filtro da fila conta) e `reason`
    é o texto livre que explica o caso concreto.
    """
    reason = (reason or "").strip()
    reason_code = (reason_code or "").strip()
    if not reason or not reason_code:
        raise ValidationError(
            {"rejection_reason": ["Rejeição exige motivo e código do motivo."]}
        )
    if reason_code not in REJECTION_REASONS:
        raise ValidationError(
            {
                "rejection_reason_code": [
                    f"Motivo desconhecido: {reason_code}. "
                    f"Use um de {', '.join(sorted(REJECTION_REASONS))}."
                ]
            }
        )
    with transaction.atomic():
        question.status = Question.Status.REJECTED
        question.reviewed_by = reviewer
        question.reviewed_at = timezone.now()
        question.review_note = ""
        question.rejection_reason = reason
        question.rejection_reason_code = reason_code
        sync_visibility(question, save=False)
        question.save(update_fields=[*REVIEW_FIELDS, "is_active", "updated_at"])
    return question


def reopen(question, reviewer, note=""):
    """Devolve a questão para a fila, por exemplo quando o conteúdo mudou na fonte."""
    with transaction.atomic():
        question.status = Question.Status.PENDING
        question.reviewed_by = reviewer
        question.reviewed_at = timezone.now()
        question.review_note = (note or "").strip()
        question.rejection_reason = ""
        question.rejection_reason_code = ""
        sync_visibility(question, save=False)
        question.save(update_fields=[*REVIEW_FIELDS, "is_active", "updated_at"])
    return question
