"""O que o aluno pode ver: uma única definição, usada por todos os leitores.

O `status` é a única fonte da verdade — só `APPROVED` chega ao aluno. Antes
existia um segundo estado (`is_active`) que era derivado do `status` por
`moderation.sync_visibility`; ele foi removido na Fase 4 porque dois estados que
precisam concordar sempre divergem em algum endpoint. Todo leitor passa por
`visible()` para que uma leitura nova não esqueça o filtro.
"""

from django.db.models import QuerySet

from .models import Question

VISIBLE_STATUS = Question.Status.APPROVED


def visible(queryset: QuerySet | None = None) -> QuerySet:
    """Questões aprovadas, a partir de um queryset ou de `Question`."""
    base = Question.objects.all() if queryset is None else queryset
    return base.filter(status=VISIBLE_STATUS)
