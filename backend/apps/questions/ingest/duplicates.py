"""Normalização de enunciados e comparação por similaridade.

A comparação entre dois enunciados é feita sobre tokens de conteúdo: sem
marcadores de imagem, sem o número da questão, sem acentuação e sem as palavras
que não carregam sentido. O Dice entre esses conjuntos é o que responde "quanto
do enunciado bate" e alimenta a regra de duplicata do plano de implementação.

Enunciado muito curto não é comparável — "Julgue o item a seguir" casaria com
qualquer outro — então abaixo de `MIN_TOKENS` só vale o hash exato.
"""

import hashlib
import re
import unicodedata
from collections import Counter

from django.conf import settings

from apps.questions.models import Question, QuestionStemToken

IMAGE_MARKER_RE = re.compile(r"\[\[image:[^\]]*\]\]", re.IGNORECASE)
QUESTION_NUMBER_RE = re.compile(r"^\s*quest\w{0,4}\s*\d+\s*[-–—:.]*\s*")
WHITESPACE_RE = re.compile(r"\s+")
NUMBER_PUNCT_RE = re.compile(r"(?<=\d)[.,](?=\d)")
ORDINAL_RE = re.compile(r"(\d)\s*[oaº°](?![a-z])")
TOKEN_RE = re.compile(r"[a-z0-9]{2,}")
PUNCTUATION_RE = re.compile(r"[^\w\s]", re.UNICODE)

MIN_TOKENS = 12
SIGNATURE_SIZE = 8
MIN_SHARED_TOKENS = 3

STOPWORDS = frozenset(
    """
    a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela para com
    sem sob sobre entre e ou mas que se ao aos à as seu sua seus suas este esta estes
    estas esse essa esses essas aquele aquela aquilo isso isto como quando onde qual
    quais foi for eram ser sao são tem tem-se haver ha há mais menos muito pouco todo
    toda todos todas outro outra outros outras ainda ja já nao não sim tambem também
    apenas somente deve devem pode podem seus nossa nosso suas nossa
    """.split()
)


def _strip_accents(text: str) -> str:
    """Tira acento do mesmo jeito que `naming`: o enunciado vira ASCII puro."""
    plain = unicodedata.normalize("NFKD", text)
    return plain.encode("ascii", "ignore").decode("ascii")


def normalize_statement(value) -> str:
    """Reduz o enunciado ao texto comparável: sem imagem, número, acento e pontuação."""
    text = str(value or "")
    text = IMAGE_MARKER_RE.sub(" ", text)
    # O acento cai antes do número porque o prefixo "Questão 12" só fica
    # comparável como "questao 12".
    text = _strip_accents(text).lower()
    text = QUESTION_NUMBER_RE.sub("", text)
    text = NUMBER_PUNCT_RE.sub("", text)
    text = ORDINAL_RE.sub(r"\1", text)
    return WHITESPACE_RE.sub(" ", text).strip()


def tokenize(value) -> frozenset:
    """Conjunto de tokens de conteúdo do enunciado, sem stopwords."""
    return frozenset(
        token
        for token in TOKEN_RE.findall(normalize_statement(value))
        if token not in STOPWORDS
    )


def comparable(value) -> bool:
    """Diz se o enunciado tem tamanho mínimo para valer a comparação por similaridade."""
    return len(tokenize(value)) >= MIN_TOKENS


def _hashable(text: str) -> str:
    """Texto normalizado sem pontuação, para o hash não depender de formatação."""
    return WHITESPACE_RE.sub(" ", PUNCTUATION_RE.sub(" ", text)).strip()


def content_hash(statement, options=None) -> str:
    """Hash estável do conteúdo (enunciado + alternativas) para igualdade exata.

    A pontuação sai daqui: "Assinale a alternativa." e "assinale a alternativa" são
    o mesmo enunciado e precisam cair no mesmo hash. A ordem das palavras é
    preservada, então duas perguntas com as mesmas palavras trocadas não colidem.
    """
    parts = [_hashable(normalize_statement(statement))]
    parts += [_hashable(normalize_statement(option)) for option in options or []]
    joined = "\n".join(part for part in parts if part)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def signature_tokens(tokens, frequencies=None, size: int = SIGNATURE_SIZE) -> list:
    """Escolhe os tokens mais raros do enunciado, que o identificam melhor na base."""
    unique = sorted(tokens)
    if not frequencies:
        return unique[:size]
    return sorted(unique, key=lambda token: (frequencies.get(token, 0), token))[:size]


def dice(left, right) -> float:
    """Dice entre dois conjuntos de tokens — 1.0 quando idênticos."""
    if not left or not right:
        return 0.0
    common = len(left & right)
    if not common:
        return 0.0
    return (2.0 * common) / (len(left) + len(right))


class DuplicateMatch:
    """Uma questão já existente que esbarrou com o item sendo importado."""

    def __init__(self, question_id, score, exact_hash=False, answer_conflict=False):
        self.question_id = question_id
        self.score = score
        self.exact_hash = exact_hash
        self.answer_conflict = answer_conflict

    @property
    def percent(self) -> int:
        return round(self.score * 100)

    def __repr__(self):
        return f"<DuplicateMatch #{self.question_id} {self.percent}% answer_conflict={self.answer_conflict}>"


class HashIndex:
    """Índice de `content_hash` para achar igualdade exata sem varrer a base inteira."""

    def __init__(self, pairs=()):
        self._by_hash: dict[str, list[int]] = {}
        for question_id, digest in pairs:
            self.add(question_id, digest)

    @classmethod
    def from_db(cls, exclude_ids=()) -> "HashIndex":
        rows = Question.objects.exclude(pk__in=list(exclude_ids)).exclude(
            content_hash=""
        )
        return cls(rows.values_list("pk", "content_hash"))

    def add(self, question_id, digest: str):
        if digest:
            self._by_hash.setdefault(digest, []).append(question_id)

    def remove(self, question_id):
        for ids in self._by_hash.values():
            if question_id in ids:
                ids.remove(question_id)

    def find(self, digest: str) -> list[int]:
        return list(self._by_hash.get(digest, ()))

    def __len__(self):
        return sum(len(ids) for ids in self._by_hash.values())


ANSWER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _letter(index) -> str:
    """Índice do gabarito virando letra, para o alerta ser legível na fila."""
    if index is None:
        return "?"
    return ANSWER_LETTERS[index] if 0 <= index < len(ANSWER_LETTERS) else "?"


def stem_candidates(
    signature, min_shared: int = MIN_SHARED_TOKENS, exclude_ids=()
) -> list[int]:
    """Ids das questões que compartilham pelo menos `min_shared` tokens de assinatura.

    Uma única consulta indexada no `QuestionStemToken` substitui comparar o item
    com a base inteira — só quem divide os tokens mais raros do enunciado chega ao
    cálculo de Dice.
    """
    if len(signature) < min_shared:
        return []
    shared = Counter()
    rows = QuestionStemToken.objects.filter(token__in=signature).exclude(
        question_id__in=list(exclude_ids)
    )
    for question_id in rows.values_list("question_id", flat=True):
        shared[question_id] += 1
    return [question_id for question_id, hits in shared.items() if hits >= min_shared]


class DuplicateChecker:
    """Compara um item com a base e diz se ele é novo, repetido ou parecido.

    Montado uma vez por execução: as frequências de token e o índice de hash são
    lidos do banco e atualizados a cada item importado, o que também faz a
    detecção **dentro do próprio arquivo** funcionar — o segundo item repetido já
    encontra o primeiro.
    """

    TOKEN_CACHE_LIMIT = 5000

    def __init__(
        self,
        threshold: float | None = None,
        suspicious: float | None = None,
        with_hash_index: bool = True,
    ):
        self.threshold = (
            threshold
            if threshold is not None
            else settings.QUESTIONS_DUPLICATE_THRESHOLD
        )
        self.suspicious = (
            suspicious
            if suspicious is not None
            else settings.QUESTIONS_SUSPICIOUS_THRESHOLD
        )
        self.frequencies = self._load_frequencies()
        # A leitura da fila só precisa de parecido, não de igualdade exata: pular o
        # índice de hash evita varrer `content_hash` da base inteira a cada página.
        self._hashes = HashIndex.from_db() if with_hash_index else HashIndex()
        self._tokens: dict[int, frozenset] = {}

    def _load_frequencies(self) -> dict[str, int]:
        frequencies: dict[str, int] = {}
        for token, df in QuestionStemToken.objects.values_list("token", "df"):
            if df:
                frequencies[token] = df
        return frequencies

    def tokens_of(self, question_id: int) -> frozenset:
        cached = self._tokens.get(question_id)
        if cached is not None:
            return cached
        statement = (
            Question.objects.filter(pk=question_id)
            .values_list("statement", flat=True)
            .first()
        )
        tokens = tokenize(statement or "")
        if len(self._tokens) >= self.TOKEN_CACHE_LIMIT:
            self._tokens.clear()
        self._tokens[question_id] = tokens
        return tokens

    def index(self, question) -> None:
        """Registra no índice em memória a questão que acabou de ser gravada."""
        self._hashes.add(question.pk, question.content_hash)
        if not self.frequencies:
            return
        tokens = tokenize(question.statement)
        if len(self._tokens) >= self.TOKEN_CACHE_LIMIT:
            self._tokens.clear()
        self._tokens[question.pk] = tokens
        for token in tokens:
            self.frequencies[token] = self.frequencies.get(token, 0) + 1

    def matches(
        self,
        statement,
        options=None,
        correct_answer=None,
        exclude_ids=(),
        limit: int = 5,
    ) -> list[DuplicateMatch]:
        """Todas as perguntas parecidas, da mais parecida para a menos.

        Igualdade exata vem primeiro e encerra a busca: o hash é conclusivo, e um
        enunciado idêntico não precisa de uma segunda opinião por similaridade.
        """
        tokens = tokenize(statement)
        digest = content_hash(statement, options)

        exact = [pk for pk in self._hashes.find(digest) if pk not in set(exclude_ids)]
        if exact:
            question = (
                Question.objects.filter(pk=exact[0]).only("correct_answer").first()
            )
            if question:
                return [
                    DuplicateMatch(
                        question.pk,
                        1.0,
                        exact_hash=True,
                        answer_conflict=self._conflict(question, correct_answer),
                    )
                ]

        # Enunciado curto não entra na regra de similaridade: "Julgue o item a
        # seguir" casaria com qualquer coisa.
        if len(tokens) < MIN_TOKENS:
            return []

        found: list[DuplicateMatch] = []
        for question_id in stem_candidates(
            signature_tokens(tokens, self.frequencies),
            exclude_ids=[*exclude_ids, *exact],
        ):
            other = self.tokens_of(question_id)
            if not other:
                continue
            score = dice(tokens, other)
            if score < self.suspicious:
                continue
            conflict = False
            if score >= self.threshold:
                answer = (
                    Question.objects.filter(pk=question_id)
                    .values_list("correct_answer", flat=True)
                    .first()
                )
                conflict = (
                    correct_answer is not None
                    and answer is not None
                    and answer != correct_answer
                )
            found.append(DuplicateMatch(question_id, score, answer_conflict=conflict))
        found.sort(key=lambda match: match.score, reverse=True)
        return found[:limit]

    def check(
        self, statement, options=None, correct_answer=None, exclude_ids=()
    ) -> DuplicateMatch | None:
        """A correspondência mais parecida que merece atenção, ou `None` se é inédita."""
        matches = self.matches(
            statement, options, correct_answer, exclude_ids, limit=1
        )
        return matches[0] if matches else None

    @staticmethod
    def _conflict(question, correct_answer) -> bool:
        return correct_answer is not None and question.correct_answer != correct_answer

    def is_duplicate(self, match: DuplicateMatch | None) -> bool:
        """Regra de bloqueio: muito parecido **e** mesmo gabarito é a mesma questão."""
        return bool(
            match and match.score >= self.threshold and not match.answer_conflict
        )

    def is_suspicious(self, match: DuplicateMatch | None) -> bool:
        return bool(match and self.suspicious <= match.score < self.threshold)

    def describe(self, match: DuplicateMatch | None, new_answer=None) -> str:
        """Texto do alerta que vai para a fila de aprovação."""
        if not match:
            return ""
        if match.answer_conflict:
            other = (
                Question.objects.filter(pk=match.question_id)
                .values_list("correct_answer", flat=True)
                .first()
            )
            return (
                f"{match.percent}% igual a #{match.question_id}, "
                f"gabarito {_letter(other)} ≠ {_letter(new_answer)}."
            )
        if match.exact_hash:
            return f"Idêntica a #{match.question_id}."
        return f"{match.percent}% igual a #{match.question_id}."
