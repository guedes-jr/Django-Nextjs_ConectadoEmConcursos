"""Leitura de arquivos XML, JSON e CSV no formato de `QuestionItem`.

O parser rico e a limpeza de número de questão vinham do `import_content` e
moram aqui agora: qualquer fonte que traga HTML passa pelo mesmo caminho, e o
`import_content` virou só um wrapper deste módulo.
"""

import csv
import io
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

from .base import QuestionItem

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CURATED_XML_EXPLANATIONS = json.loads((DATA_DIR / "xml_explanations.json").read_text(encoding="utf-8"))

SUPPORTED_SUFFIXES = {".json", ".csv", ".xml"}


class QuestionHTMLParser(HTMLParser):
    """Convert the exported rich text to readable text and safe image markers."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3", "ul", "ol", "blockquote"}:
            self.parts.append("\n")
        if tag == "li":
            self.parts.append("• ")
        if tag == "img":
            src = dict(attrs).get("src", "")
            if re.match(r"^https://[^\s]+$", src) or re.match(
                r"^data:image/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$", src
            ):
                self.parts.append(f"\n[[image:{src}]]\n")

    def handle_endtag(self, tag):
        if tag in {"p", "div", "li", "h1", "h2", "h3", "blockquote"}:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)

    def text(self):
        return re.sub(r"\n{3,}", "\n\n", "".join(self.parts)).strip()


def rich_text(value):
    parser = QuestionHTMLParser()
    parser.feed(value or "")
    return parser.text()


def without_question_number(value):
    return re.sub(
        r"^QUEST[ÃA]O\s*(?:N[º°.]?\s*)?\d+\s*(?:[.°º:–—-]\s*)?",
        "",
        value or "",
        count=1,
        flags=re.IGNORECASE,
    ).strip()


def _boolean(value, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return default
    return str(value).strip().lower() not in {"0", "false", "não", "nao", "no"}


def _int_or_none(value):
    text = str(value if value is not None else "").strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _options(value):
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, list) or len(value) < 2:
        raise ValueError("options deve conter ao menos duas alternativas")
    return [rich_text(option) or "[Alternativa sem conteúdo na fonte]" for option in value]


def parse_xml_text(text: str) -> list[QuestionItem]:
    try:
        root = ElementTree.fromstring(text.lstrip())
    except ElementTree.ParseError as exc:
        # `ParseError` é `SyntaxError`, não `ValueError`: sem esta tradução, quem
        # chama só com texto (o formulário de conversão) não pega a exceção.
        raise ValueError(f"XML inválido: {exc}") from exc
    if root.tag != "questions":
        raise ValueError("a raiz do XML deve ser <questions>")
    return [item for number, node in enumerate(root, 1) if (item := _xml_item(node, number))]


def parse_xml(path: Path) -> list[QuestionItem]:
    return parse_xml_text(Path(path).read_text(encoding="utf-8-sig"))


def _xml_item(node, number: int) -> QuestionItem:
    if node.tag != "question":
        raise ValueError(f"item {number}: esperado <question>")
    options = node.find("options")
    if options is None:
        raise ValueError(f"item {number}: alternativas ausentes")
    letters = [option.get("letter", "").strip().upper() for option in options]
    answer = (node.findtext("correct_answer") or "").strip().upper()
    if answer not in letters or len(set(letters)) != len(letters):
        raise ValueError(f"item {number}: gabarito ou letras inválidas")
    statement = "\n\n".join(
        filter(
            None,
            [
                without_question_number(rich_text(node.findtext("statement"))),
                without_question_number(rich_text(node.findtext("command"))),
            ],
        )
    )
    if not statement:
        raise ValueError(f"item {number}: enunciado vazio")
    external_id = (node.get("id") or "").strip()
    xml_explanation = rich_text(node.findtext("explanation"))
    return QuestionItem(
        external_id=external_id,
        statement=statement,
        options=[rich_text(option.text) for option in options],
        correct_answer=letters.index(answer),
        banca=(node.findtext("institution") or "").strip(),
        year=int(node.findtext("year")),
        discipline=(node.findtext("subject") or "").replace("_", " ").title(),
        exam_title=(node.findtext("exam_name") or "").strip(),
        role=(node.findtext("cargo") or "").replace("_", " ").title(),
        number=_int_or_none(node.get("number") or node.findtext("number")),
        explanation=xml_explanation or CURATED_XML_EXPLANATIONS.get(external_id, ""),
        curated_explanation=not xml_explanation,
        source_url=(node.get("url") or "").strip(),
    )


def parse_json_text(text: str) -> list[QuestionItem]:
    payload = json.loads(text.lstrip("\ufeff"))
    if isinstance(payload, dict):
        if "questions" not in payload:
            raise ValueError('o objeto JSON precisa da chave "questions"')
        payload = payload["questions"]
    if not isinstance(payload, list):
        raise ValueError("o JSON deve ser uma lista de questões")
    return [
        item for number, row in enumerate(payload, 1) if (item := row_item(row, number))
    ]


def parse_json(path: Path) -> list[QuestionItem]:
    return parse_json_text(Path(path).read_text(encoding="utf-8-sig"))


def parse_csv_text(text: str) -> list[QuestionItem]:
    rows = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    return [item for number, row in enumerate(rows, 1) if (item := row_item(row, number))]


def parse_csv(path: Path) -> list[QuestionItem]:
    return parse_csv_text(Path(path).read_text(encoding="utf-8-sig"))


def row_item(row, number: int) -> QuestionItem:
    if not isinstance(row, dict):
        raise ValueError(f"linha {number}: objeto esperado")
    for required in ("statement", "banca", "year", "discipline", "correct_answer"):
        if not str(row.get(required, "")).strip():
            raise ValueError(f"linha {number}: campo obrigatório ausente: {required}")
    return QuestionItem(
        external_id=str(row.get("source_id") or row.get("id") or "").strip(),
        statement=without_question_number(rich_text(row["statement"])),
        options=_options(row["options"]),
        correct_answer=int(row["correct_answer"]),
        banca=str(row["banca"]).strip(),
        year=int(row["year"]),
        discipline=str(row["discipline"]).strip(),
        exam_title=str(row.get("exam_title", "")).strip(),
        institution=str(row.get("institution", "")).strip(),
        role=str(row.get("role", "")).strip(),
        level=str(row.get("level", "")).strip(),
        state=str(row.get("state", "")).strip().upper()[:2],
        number=_int_or_none(row.get("number")),
        explanation=rich_text(str(row.get("explanation", ""))),
        curated_explanation=_boolean(row.get("curated_explanation"), default=False),
        source_url=str(row.get("source_url", "")).strip(),
        is_published_exam=_boolean(row.get("is_published"), default=True),
    )


PARSERS = {".xml": parse_xml, ".json": parse_json, ".csv": parse_csv}


TEXT_PARSERS = {".xml": parse_xml_text, ".json": parse_json_text, ".csv": parse_csv_text}


def parse_content(text: str, filename: str = "") -> list[QuestionItem]:
    """Lê o conteúdo colado no formulário de conversão de prova.

    O admin cola o XML ou o JSON direto no campo, sem passar por arquivo nenhum. Com
    `filename` o sufixo decide; sem ele, o formato é deduzido do próprio texto, e
    erro de formato é erro do admin — não da fonte.
    """
    body = (text or "").strip()
    if not body:
        raise ValueError("Cole o XML ou o JSON da prova.")
    suffix = Path(filename).suffix.lower() if filename else ""
    if suffix in TEXT_PARSERS:
        return TEXT_PARSERS[suffix](body)
    if body.startswith("{"):
        return parse_json_text(body)
    if body.startswith("<"):
        return parse_xml_text(body)
    if body.startswith(("[", "statement,", "statement;")) or "," in body.splitlines()[0]:
        return parse_csv_text(body)
    raise ValueError("Não reconheci o formato: cole um XML, um JSON ou um CSV.")


def parse_file(path: Path) -> list[QuestionItem]:
    """Lê um arquivo e devolve itens já normalizados, sem tocar no banco."""
    path = Path(path)
    if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ValueError("Informe um arquivo .json, .csv ou .xml existente.")
    return PARSERS[path.suffix.lower()](path)
