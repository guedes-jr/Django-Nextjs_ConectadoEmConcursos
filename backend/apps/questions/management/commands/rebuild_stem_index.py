"""Reconstrói o índice de tokens de enunciado usado na busca de duplicatas.

A migração da Fase 0 populou o índice uma vez; o comando existe para quando as
perguntas/frequências mudarem de forma que a reconstrução pontual não cobre.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.questions.ingest.duplicates import signature_tokens, tokenize
from apps.questions.models import Question, QuestionStemToken


class Command(BaseCommand):
    help = "Reconstrói o QuestionStemToken com os tokens mais raros de cada enunciado."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=200)

    @transaction.atomic
    def handle(self, *args, **options):
        QuestionStemToken.objects.all().delete()
        frequencies: dict[str, int] = {}
        tokens_by_question: list[tuple[int, frozenset]] = []
        rows = Question.objects.all().values_list("pk", "statement")
        for question_id, statement in rows.iterator(chunk_size=options["batch_size"] * 5):
            tokens = tokenize(statement)
            tokens_by_question.append((question_id, tokens))
            for token in tokens:
                frequencies[token] = frequencies.get(token, 0) + 1

        rows_to_write = [
            QuestionStemToken(question_id=question_id, token=token, df=frequencies[token])
            for question_id, tokens in tokens_by_question
            for token in signature_tokens(tokens, frequencies)
        ]
        QuestionStemToken.objects.bulk_create(rows_to_write, batch_size=options["batch_size"])
        self.stdout.write(
            self.style.SUCCESS(
                f"Índice reconstruído: {len(tokens_by_question)} questão(ões), "
                f"{len(rows_to_write)} token(s), {len(frequencies)} distinto(s)."
            )
        )
