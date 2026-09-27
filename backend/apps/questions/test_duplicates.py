from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.questions.ingest.duplicates import (
    MIN_TOKENS,
    comparable,
    content_hash,
    dice,
    normalize_statement,
    signature_tokens,
    tokenize,
)
from apps.questions.models import Question, QuestionSource
from apps.questions.naming import banca_query, banca_variants, normalize_banca


class NormalizeStatementTests(TestCase):
    def test_drops_image_marker_and_question_number(self):
        self.assertEqual(
            normalize_statement(
                "Questão 12 — [[image:grafico.png]] Assinale a alternativa correta."
            ),
            "assinale a alternativa correta.",
        )

    def test_folds_accents_case_and_number_formatting(self):
        self.assertEqual(
            normalize_statement("A Lei 8.112 e o 5º anexo"),
            normalize_statement("a lei 8112 e o 5 anexo"),
        )

    def test_empty_input_is_empty(self):
        self.assertEqual(normalize_statement(None), "")


class TokenizeTests(TestCase):
    def test_removes_stopwords_and_short_tokens(self):
        self.assertEqual(
            tokenize("Assinale a alternativa de 5"),
            frozenset({"assinale", "alternativa"}),
        )

    def test_min_tokens_gate(self):
        self.assertFalse(comparable("Julgue o item a seguir"))
        self.assertLess(len(tokenize("Julgue o item a seguir")), MIN_TOKENS)

    def test_long_enunciado_is_comparable(self):
        enunciado = (
            "Considerando o disposto no art. 5 da Lei de Abuso de Autoridade, e que o servidor "
            "publico responde pelos danos causados no exercicio de suas funcoes, assinale a alternativa correta"
        )
        self.assertTrue(comparable(enunciado))


class DiceTests(TestCase):
    def test_identical_sets_score_one(self):
        tokens = tokenize("Assinale a alternativa correta sobre a lei")
        self.assertEqual(dice(tokens, tokens), 1.0)

    def test_disjoint_sets_score_zero(self):
        left = tokenize("Assinale a alternativa correta sobre a lei")
        right = tokenize("contrato symbolize orchard windows")
        self.assertEqual(dice(left, right), 0.0)

    def test_empty_side_scores_zero(self):
        self.assertEqual(dice(frozenset(), frozenset({"a"})), 0.0)

    def test_partial_overlap_is_between_zero_and_one(self):
        base = (
            "considerando o disposto no art 5 da lei de abuso de autoridade o servidor publico responde "
            "pelos danos causados no exercicio de suas funcoes"
        )
        score = dice(tokenize(base), tokenize(base + " assinale a alternativa correta"))
        self.assertTrue(0.0 < score < 1.0)


class ContentHashTests(TestCase):
    def test_same_content_same_hash_regardless_of_formatting(self):
        self.assertEqual(
            content_hash("Questão 1 — Assinale a alternativa.", ["Não", "Sim"]),
            content_hash("assinale a alternativa", ["não", "sim"]),
        )

    def test_different_options_differ(self):
        self.assertNotEqual(
            content_hash("Assinale.", ["Não", "Sim"]),
            content_hash("Assinale.", ["Não"]),
        )

    def test_word_order_matters(self):
        self.assertNotEqual(
            content_hash("a lei e o decreto", []), content_hash("o decreto e a lei", [])
        )


class SignatureTokensTests(TestCase):
    def test_keeps_rarest_tokens_first(self):
        tokens = frozenset(
            {"lei", "artigo", "abuso", "autoridade", "servidor", "publico"}
        )
        frequencies = {
            "lei": 900,
            "artigo": 500,
            "abuso": 3,
            "autoridade": 2,
            "servidor": 800,
            "publico": 700,
        }
        self.assertEqual(
            signature_tokens(tokens, frequencies)[:2], ["autoridade", "abuso"]
        )

    def test_without_frequencies_falls_back_to_alphabetic(self):
        self.assertEqual(signature_tokens(frozenset({"b", "a"})), ["a", "b"])


class BancaNamingTests(TestCase):
    def test_normalizes_known_aliases(self):
        for raw in ("CESPE", "cespe", "CESPE/UNB", "CEB", "cebraspe"):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_banca(raw), "CEBRASPE")

    def test_keeps_unknown_banca(self):
        self.assertEqual(normalize_banca("PF"), "PF")

    def test_variants_cover_old_grafia(self):
        self.assertEqual(
            banca_variants("CESPE"), ["CEB", "CEBRASPE", "CESPE", "CESPEUNB"]
        )

    def test_query_accepts_alias(self):
        Question.objects.create(
            discipline="Direito",
            banca="CEBRASPE",
            year=2024,
            statement="Enunciado",
            options=["a"],
            correct_answer=0,
        )
        self.assertEqual(Question.objects.filter(banca_query("CESPE")).count(), 1)
        self.assertEqual(Question.objects.filter(banca_query("cebraspe")).count(), 1)
        self.assertEqual(Question.objects.filter(banca_query("PF")).count(), 0)
        self.assertEqual(Question.objects.filter(banca_query("")).count(), 1)


class QuestionSourceTests(TestCase):
    def test_external_id_is_unique_per_source_not_globally(self):
        first = QuestionSource.objects.create(slug="fonte-a", name="Fonte A")
        second = QuestionSource.objects.create(slug="fonte-b", name="Fonte B")
        common = dict(
            discipline="Direito",
            year=2024,
            statement="Enunciado",
            options=["a"],
            correct_answer=0,
        )
        Question.objects.create(source=first, external_id="q1", **common)
        Question.objects.create(source=second, external_id="q1", **common)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Question.objects.create(source=second, external_id="q1", **common)

    def test_new_question_starts_pending(self):
        question = Question.objects.create(
            discipline="Direito",
            banca="PF",
            year=2024,
            statement="Enunciado",
            options=["a"],
            correct_answer=0,
        )
        self.assertEqual(question.status, Question.Status.PENDING)
        # O default=False garante que nada entra no ar sem passar pelo moderation.approve.
        self.assertFalse(question.is_active)
