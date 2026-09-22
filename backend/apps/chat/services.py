import requests
from django.conf import settings
from django.core.signing import salted_hmac
from django.db.models import Count, Q

from apps.questions.models import UserAnswer
from apps.billing.services import capabilities_for
from apps.questions.models import Exam, Question


def local_response(user, prompt):
    answers = UserAnswer.objects.filter(user=user)
    total = answers.count()
    correct = answers.filter(is_correct=True).count()
    disciplines = list(answers.values("question__discipline").annotate(
        total=Count("id"), correct=Count("id", filter=Q(is_correct=True))
    ).order_by("correct")[:5])
    accuracy = round(correct * 100 / total) if total else 0
    if "plano" in prompt.lower():
        focus = ", ".join(item["question__discipline"] for item in disciplines) or "as disciplinas do seu edital"
        return f"Plano sugerido: priorize {focus}. Faça dois blocos de questões por dia, revise os erros após 24 horas e acompanhe sua evolução semanal. Seu histórico atual tem {total} tentativas e {accuracy}% de acerto."
    if "estat" in prompt.lower() or "resumo" in prompt.lower():
        return f"Você realizou {total} tentativas, acertou {correct} e mantém {accuracy}% de aproveitamento. Resolva mais questões para tornar a análise por disciplina mais representativa."
    return "Posso analisar suas estatísticas, montar um plano de estudos ou ajudar a compreender uma questão. Inclua o enunciado e as alternativas para uma orientação mais específica."


def extract_output_text(payload):
    texts = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                texts.append(content["text"])
    return "\n".join(texts).strip()


def build_study_context(question_ids=None, exam_id=None):
    parts = []
    if exam_id:
        exam = Exam.objects.filter(pk=exam_id, is_published=True).first()
        if exam:
            parts.append(f"Prova: {exam.title} — {exam.banca}, {exam.year}, {exam.institution}, {exam.role}.")
    questions = Question.objects.filter(pk__in=question_ids or [], is_active=True)[:5]
    for question in questions:
        options = " | ".join(f"{index}: {text}" for index, text in enumerate(question.options))
        parts.append(f"Questão {question.pk} ({question.discipline}): {question.statement}\nAlternativas: {options}")
    return "\n\n".join(parts)


def generate_response(user, messages, study_context=""):
    capabilities = capabilities_for(user)
    prompt = messages[-1]["content"]
    if study_context:
        prompt = f"{prompt}\n\nContexto selecionado pelo estudante:\n{study_context}"
        messages = [*messages[:-1], {"role": "user", "content": prompt}]
    if not settings.OPENAI_API_KEY or not capabilities["ai_provider"]:
        return local_response(user, prompt), "local", {"input_tokens": 0, "output_tokens": 0}
    response = requests.post(
        settings.OPENAI_API_URL,
        headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}", "Content-Type": "application/json"},
        json={
            "model": settings.OPENAI_MODEL,
            "instructions": "Você é um tutor para concursos públicos. Responda em português, seja didático, não invente leis ou gabaritos e deixe incertezas explícitas.",
            "input": messages,
            "store": False,
            "safety_identifier": salted_hmac("chat-safety", str(user.pk)).hexdigest(),
            "max_output_tokens": 1200,
        },
        timeout=settings.OPENAI_TIMEOUT,
    )
    response.raise_for_status()
    text = extract_output_text(response.json())
    if not text:
        raise RuntimeError("O provedor não retornou texto.")
    usage = response.json().get("usage", {})
    return text, "openai", {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }
