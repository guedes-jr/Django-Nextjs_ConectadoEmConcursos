"""Normalização de nomes de disciplinas.

Nomes vindos de arquivos de conteúdo chegam sem acentuação (ex.: "Portugues",
"Raciocinio Logico"). Centraliza a correção usada na importação e em
migrações de dados.
"""

import re

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