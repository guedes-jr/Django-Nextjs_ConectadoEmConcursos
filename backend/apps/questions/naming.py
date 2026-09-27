"""Normalização de disciplinas e bancas, incluindo o catálogo editorial opcional."""

import re
import unicodedata

from django.db.models import Q

DISCIPLINE_RENAMES = {
    "Administracao Recursos Materiais": "Administração de Recursos Materiais", "Afo": "AFO",
    "Eca": "ECA", "Etica Administracao": "Ética Administração",
}
WORD_FIXES = {
    "administracao": "administração", "basica": "básica", "comunicacao": "comunicação",
    "especifica": "específica", "especifico": "específico", "estatistica": "estatística",
    "etica": "ética", "gestao": "gestão", "informatica": "informática",
    "legislacao": "legislação", "logica": "lógica", "logico": "lógico",
    "matematica": "matemática", "portugues": "português", "publica": "pública",
    "publico": "público", "raciocinio": "raciocínio", "redacao": "redação",
    "tecnica": "técnica", "tecnico": "técnico",
}
_LOWERCASE_WORDS = {"da", "das", "de", "do", "dos", "e", "em"}
_PUNCTUATION_RE = re.compile(r"[^\w\s]", re.UNICODE)
_SPACES_RE = re.compile(r"\s+")
_RAW_BANCAS_ALIASES = {"CESPE": "CEBRASPE", "CESPE/UNB": "CEBRASPE", "CEB": "CEBRASPE"}


def _fix_words(name):
    fixed = []
    for word in name.split():
        corrected = WORD_FIXES.get(word.lower(), word)
        fixed.append(corrected.lower() if corrected.lower() in _LOWERCASE_WORDS else corrected[:1].upper() + corrected[1:])
    return " ".join(fixed)


def normalize_discipline(value):
    if not value:
        return value
    name = " ".join(str(value).split())
    return DISCIPLINE_RENAMES.get(name, _fix_words(name))


def banca_key(value) -> str:
    """Chave sem acento, pontuação, espaços extras ou distinção de caixa."""
    plain = unicodedata.normalize("NFKD", str(value or ""))
    plain = plain.encode("ascii", "ignore").decode("ascii")
    return _SPACES_RE.sub(" ", _PUNCTUATION_RE.sub("", plain)).upper().strip()


# Aliases históricos continuam válidos mesmo sem nenhum item no catálogo.
BANCAS_ALIASES = {banca_key(alias): banca_key(target) for alias, target in _RAW_BANCAS_ALIASES.items()}
BANCAS_ALIASES.update({canonical: canonical for canonical in BANCAS_ALIASES.values()})


def _catalog_match(*keys):
    """Resolve no catálogo sem torná-lo obrigatório para importação ou filtros."""
    keys = [key for key in dict.fromkeys(keys) if key]
    if not keys:
        return None
    # Importação local evita dependência circular durante o carregamento dos modelos.
    from apps.questions.models import BancaAlias, BancaCatalog

    alias = BancaAlias.objects.select_related("banca").filter(normalized_alias__in=keys).first()
    if alias:
        return alias.banca.name
    catalog = BancaCatalog.objects.filter(normalized_name__in=keys).first()
    return catalog.name if catalog else None


def normalize_banca(value):
    """Retorna nome canônico do catálogo; na ausência dele usa os aliases legados."""
    if not value:
        return value
    name = " ".join(str(value).split()).strip()
    if not name:
        return name
    raw_key = banca_key(name)
    legacy_key = BANCAS_ALIASES.get(raw_key, raw_key)
    return _catalog_match(raw_key, legacy_key) or BANCAS_ALIASES.get(raw_key, name)


def banca_variants(value):
    """Grafias aceitas por filtros, preservando URLs salvas com aliases antigos."""
    if not value:
        return []
    name = " ".join(str(value).split()).strip()
    canonical = normalize_banca(name)
    variants = {name, canonical}
    canonical_key = banca_key(canonical)
    for alias, target in BANCAS_ALIASES.items():
        if canonical_key in {target, alias}:
            variants.add(alias)
    from apps.questions.models import BancaCatalog

    catalog = BancaCatalog.objects.prefetch_related("aliases").filter(normalized_name=canonical_key).first()
    if catalog:
        variants.update(alias.alias for alias in catalog.aliases.all())
    return sorted(variants)


def banca_query(value, prefix: str = ""):
    field = f"{prefix}banca"
    query = Q()
    for variant in banca_variants(value):
        query |= Q(**{f"{field}__iexact": variant})
    return query
