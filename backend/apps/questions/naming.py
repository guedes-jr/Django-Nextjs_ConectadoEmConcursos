"""Normalização de nomes de disciplinas e bancas.

Nomes vindos de arquivos de conteúdo chegam sem acentuação (ex.: "Portugues",
"Raciocinio Logico"). Centraliza a correção usada na importação e em migrações
de dados.
"""

import re
import unicodedata

from django.db.models import Q

DISCIPLINE_RENAMES = {
    "Administracao Recursos Materiais": "Administração de Recursos Materiais",
    "Afo": "AFO",
    "Eca": "ECA",
    "Etica Administracao": "Ética Administração",
}


WORD_FIXES = {
    "administracao": "administração",
    "basica": "básica",
    "comunicacao": "comunicação",
    "especifica": "específica",
    "especifico": "específico",
    "estatistica": "estatística",
    "etica": "ética",
    "gestao": "gestão",
    "informatica": "informática",
    "legislacao": "legislação",
    "logica": "lógica",
    "logico": "lógico",
    "matematica": "matemática",
    "portugues": "português",
    "publica": "pública",
    "publico": "público",
    "raciocinio": "raciocínio",
    "redacao": "redação",
    "tecnica": "técnica",
    "tecnico": "técnico",
}

_LOWERCASE_WORDS = {"da", "das", "de", "do", "dos", "e", "em"}


def _fix_words(name):
    fixed = []
    for word in name.split():
        corrected = WORD_FIXES.get(word.lower(), word)
        if corrected.lower() in _LOWERCASE_WORDS:
            corrected = corrected.lower()
        else:
            corrected = corrected[:1].upper() + corrected[1:]
        fixed.append(corrected)
    return " ".join(fixed)


def normalize_discipline(value):
    """Retorna a forma acentuada e padronizada de um nome de disciplina."""
    if not value:
        return value
    name = " ".join(str(value).split())
    if name in DISCIPLINE_RENAMES:
        return DISCIPLINE_RENAMES[name]
    return _fix_words(name)


# Bancas que mudaram de nome (ou de grafia) ao longo do tempo. O mesmo
# examinador não pode virar duas opções no filtro, e link salvo pelo aluno com a
# grafia antiga precisa continuar funcionando.
_PUNCTUATION_RE = re.compile(r"[^\w\s]", re.UNICODE)
_SPACES_RE = re.compile(r"\s+")

_RAW_BANCAS_ALIASES = {
    "CESPE": "CEBRASPE",
    "CESPE/UNB": "CEBRASPE",
    "CEB": "CEBRASPE",
}


def _plain(value):
    """Mesma do `naming.normalize_banca`: sem acento, pontuação ou caixa."""
    plain = unicodedata.normalize("NFKD", str(value))
    plain = plain.encode("ascii", "ignore").decode("ascii")
    return _SPACES_RE.sub(" ", _PUNCTUATION_RE.sub("", plain)).upper()


BANCAS_ALIASES = {_plain(alias): _plain(target) for alias, target in _RAW_BANCAS_ALIASES.items()}
# A forma canônica também é chave: `normalize_banca("cebraspe")` precisa devolver
# `CEBRASPE`, senão a mesma banca entra duas vezes no filtro por caixa diferente.
BANCAS_ALIASES.update({canonical: canonical for canonical in BANCAS_ALIASES.values()})


def normalize_banca(value):
    """Retorna a forma canônica do nome da banca."""
    if not value:
        return value
    name = " ".join(str(value).split()).strip()
    if not name:
        return name
    return BANCAS_ALIASES.get(_plain(name), name)


def banca_variants(value):
    """Lista as grafias conhecidas de uma banca, incluindo a digitada pelo aluno."""
    if not value:
        return []
    name = " ".join(str(value).split()).strip()
    canonical = normalize_banca(name)
    variants = {name, canonical}
    canonical_key = _plain(canonical)
    for alias, target in BANCAS_ALIASES.items():
        if canonical_key in {target, alias}:
            variants.add(alias)
    return sorted(variants)


def banca_query(value, prefix: str = ""):
    """Filtro de banca que aceita as grafias antigas, sem diferenciar caixa.

    `?banca=CESPE` continua funcionando depois que a migração passa a gravar
    `CEBRASPE`. `prefix` aponta o filtro para outro caminho, como
    `question__banca` na estatística de respostas.
    """
    field = f"{prefix}banca"
    query = Q()
    for variant in banca_variants(value):
        query |= Q(**{f"{field}__iexact": variant})
    return query
