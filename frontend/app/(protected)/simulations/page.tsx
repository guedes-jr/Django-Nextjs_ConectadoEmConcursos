"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  History,
  Loader2,
  Play,
  RefreshCw,
  Trophy,
  XCircle,
} from "lucide-react";

import { listQuestionDisciplines, listQuestions, submitSimulation, Question, SimulationResult } from "@/lib/questions";
import { listSimulations, SimulationRun } from "@/lib/simulations";

const COUNT_OPTIONS = [10, 20, 30, 50];

function letterFor(index: number) {
  return `${String.fromCharCode(97 + index)})`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SimulacoesPage() {
  const [step, setStep] = useState<"config" | "playing" | "result">("config");
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [count, setCount] = useState(20);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [recent, setRecent] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [disciplineList, runs] = await Promise.all([
          listQuestionDisciplines(),
          listSimulations(),
        ]);
        if (cancelled) return;
        setDisciplines(disciplineList);
        setRecent(runs.slice(0, 5));
      } catch {
        // não bloqueia a página de configuração
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const data = await listQuestions({
        page_size: 50,
        discipline: discipline || undefined,
      });
      const pool = [...data.results];
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const selected = pool.slice(0, count);
      if (selected.length === 0) {
        setError("Nenhuma questão disponível com esses critérios.");
        return;
      }
      setQuestions(selected);
      setAnswers(new Array(selected.length).fill(null));
      setIndex(0);
      setResults([]);
      setStep("playing");
    } catch {
      setError("Não foi possível carregar as questões do simulado.");
    } finally {
      setStarting(false);
    }
  }, [count, discipline]);

  const answeredCount = useMemo(
    () => answers.filter((value) => value !== null).length,
    [answers],
  );

  const question = questions[index];

  const chooseOption = (optionIndex: number) => {
    setAnswers((current) => {
      const next = [...current];
      next[index] = optionIndex;
      return next;
    });
  };

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = questions.flatMap((item, i) =>
        answers[i] === null ? [] : [{ question_id: item.id, selected_answer: answers[i] as number }],
      );
      if (payload.length === 0) {
        setError("Responda pelo menos uma questão antes de concluir.");
        setSubmitting(false);
        return;
      }
      const submitted = await submitSimulation(payload);
      setResults(submitted);
      setStep("result");
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail ?? "Não foi possível enviar o simulado.");
    } finally {
      setSubmitting(false);
    }
  }, [questions, answers]);

  const finish = () => {
    if (submitting) return;
    const blank = questions.length - answeredCount;
    if (blank > 0) {
      const ok = window.confirm(
        `Você deixou ${blank} questão${blank === 1 ? "" : "ões"} em branco. Enviar apenas as respondidas?`,
      );
      if (!ok) return;
    }
    void submit();
  };

  const resultMap = useMemo(
    () => new Map(results.map((item) => [item.question_id, item])),
    [results],
  );
  const score = results.filter((item) => item.is_correct).length;
  const total = results.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const message =
    percentage >= 90
      ? "Excelente! Você está muito bem preparado."
      : percentage >= 70
        ? "Muito bom! Continue nesse ritmo."
        : percentage >= 50
          ? "Você está no caminho certo, mas ainda pode melhorar."
          : "Continue estudando: revise os conteúdos das questões erradas.";

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-4xl items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </main>
    );
  }

  if (step === "playing" && question) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Simulado Digital</h1>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {answeredCount} de {questions.length} respondidas
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                {question.discipline}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Questão {index + 1} de {questions.length}
              </p>
            </div>
            <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{question.statement}</p>

            <div className="mt-6 space-y-3">
              {question.options.map((option, optionIndex) => {
                const selected = answers[index] === optionIndex;
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    onClick={() => chooseOption(optionIndex)}
                    aria-pressed={selected}
                    className={`flex w-full items-baseline gap-2 rounded-xl p-4 text-left transition ${
                      selected ? "" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className={`inline-flex h-5 shrink-0 items-center justify-center rounded-lg px-3 text-xs font-bold leading-none ${
                        selected
                          ? "bg-blue-600 text-white"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {letterFor(optionIndex)}
                    </span>
                    <span className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{option}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}

          <footer className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={index === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
            >
              <ArrowLeft size={15} /> Anterior
            </button>
            <div>
              {index < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setIndex((current) => Math.min(questions.length - 1, current + 1))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Próxima <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finish}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Trophy size={15} />}
                  Concluir simulado
                </button>
              )}
            </div>
          </footer>
        </div>
      </main>
    );
  }

  if (step === "result" && total > 0) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <div
              className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full text-3xl font-bold ${
                percentage >= 70
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
              }`}
            >
              {percentage}%
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-100">
              Você acertou {score} de {total}
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">{message}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setStep("config")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <RefreshCw size={15} /> Novo simulado
              </button>
              <Link
                href="/simulations/history"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
              >
                <History size={15} /> Ver histórico
              </Link>
            </div>
          </section>

          <section className="space-y-4">
            {questions.map((item) => {
              const feedback = resultMap.get(item.id);
              const isBlank = !feedback;
              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-5 dark:border-slate-800 dark:bg-slate-900 ${
                    isBlank
                      ? "bg-slate-50 dark:bg-slate-900"
                      : feedback?.is_correct
                        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                        : "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {item.discipline}
                    </p>
                    {isBlank ? (
                      <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Em branco
                      </span>
                    ) : feedback!.is_correct ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        <CheckCircle2 size={13} /> Correta
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
                        <XCircle size={13} /> Incorreta
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{item.statement}</p>
                  <div className="mt-4 space-y-2">
                    {item.options.map((option, optionIndex) => {
                      const isCorrectOption = !isBlank && feedback!.correct_answer === optionIndex;
                      const isWrongPick = !isBlank && feedback!.selected_answer === optionIndex && !feedback!.is_correct;
                      return (
                        <p
                          key={optionIndex}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            isCorrectOption
                              ? "bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : isWrongPick
                                ? "bg-red-100 font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300"
                                : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {letterFor(optionIndex)} {option}
                        </p>
                      );
                    })}
                  </div>
                  {!isBlank && feedback!.explanation && (
                    <p className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">Explicação: </span>
                      {feedback!.explanation}
                    </p>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Simulados Digital</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Monte um simulado com questões de provas anteriores e receba a correção na hora.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Disciplina</span>
              <select
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Todas as disciplinas</option>
                {disciplines.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Número de questões</span>
              <div className="flex gap-2">
                {COUNT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCount(value)}
                    aria-pressed={count === value}
                    className={`h-10 min-w-12 rounded-lg px-3 text-sm font-semibold transition ${
                      count === value
                        ? "bg-blue-600 text-white"
                        : "bg-white text-blue-600 ring-1 ring-slate-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            O simulado pode respeitar o limite diário de questões do seu plano.
          </p>
          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void start()}
            disabled={starting}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
          >
            {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {starting ? "Montando simulado..." : "Iniciar simulado"}
          </button>
        </section>

        {recent.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <History size={16} className="text-blue-600" /> Últimos resultados
              </h2>
              <Link
                href="/simulations/history"
                className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver todos
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((run) => (
                <Link
                  key={run.id}
                  href={`/simulations/review?run=${run.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {run.score} de {run.total} ({run.total > 0 ? Math.round((run.score / run.total) * 100) : 0}%)
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(run.created_at)}</p>
                  </div>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Revisar</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}