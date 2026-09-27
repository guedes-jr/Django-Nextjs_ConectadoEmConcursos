"""Estruturas normalizadas do pipeline de importação de questões.

Um `QuestionItem` é o mesmo dado, independente do adaptador que o produziu: o
pipeline grava, o dedupe compara e o `SearchRun` registra sem saber se veio de um
XML enviado pelo aluno ou de uma API pública.
"""

from dataclasses import dataclass, field


@dataclass
class QuestionItem:
    """Uma questão como a fonte a conhece, ainda não gravada no banco."""

    statement: str
    options: list[str]
    correct_answer: int
    banca: str
    year: int
    discipline: str
    external_id: str = ""
    exam_title: str = ""
    exam_external_id: str = ""
    institution: str = ""
    role: str = ""
    level: str = ""
    state: str = ""
    number: int | None = None
    explanation: str = ""
    curated_explanation: bool = False
    source_url: str = ""
    is_published_exam: bool = True

    @property
    def has_answer(self) -> bool:
        return self.correct_answer is not None and 0 <= self.correct_answer < len(self.options)


@dataclass
class FetchResult:
    """O que uma execução de adapter devolve: itens, total e dicas de continuação."""

    items: list[QuestionItem] = field(default_factory=list)
    total: int | None = None
    next_page: int | None = None
    facets: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Option:
    """Opção de um filtro, com o valor que vai para o histórico do `SearchRun`."""

    value: str
    label: str
    count: int | None = None


@dataclass(frozen=True)
class FilterSpec:
    """Filtro declarado por um adapter: vira um campo do formulário e uma chave do histórico."""

    key: str
    label: str
    kind: str
    param: str = ""
    options_from: str = ""
    multiple: bool = False
    required: bool = False
    help_text: str = ""

    def __post_init__(self):
        if not self.param:
            object.__setattr__(self, "param", self.key)
        if not self.options_from:
            object.__setattr__(self, "options_from", "adapter" if self.kind in {"select", "multiselect"} else "")
