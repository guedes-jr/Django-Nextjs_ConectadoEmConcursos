"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, History, Loader2, XCircle } from "lucide-react";

import type { Question } from "@/lib/questions";
import { getQuestionDetails, listSimulations, SimulationRun } from "@/lib/simulations";

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

function ReviewContent() {
  const params = useSearchParams();
  const runId = Number(params.get("run") ?? 0);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [questions, setQuestions] = useState<Record<number, Question>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!runId) {
      setError("Simulado não encontrado.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const runs = await listSimulations();
        const found = runs.find((item) => item.id === runId);
        if (cancelled || !found) {
          if (!cancelled) setError("Simulado não encontrado.");
          if (!cancelled) setLoading(false);
          return;
        }
        setRun(found);
        const details = await Promise.all(
          found.answers.map((answer) => getQuestionDetails(answer.question_id)),
        );
        if (cancelled) return;
        const map: Record<number, Question> = {};
        for (const item of details) map[item.id] = item;
        setQuestions(map);
      } catch {
        if (!cancelled) setError("Não foi possível carregar a revisão do simulado.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-4xl items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <History className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h1 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">{error ?? "Simulado não encontrado"}</h1>
          <Link
            href="/simulations/history"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft size={15} /> Voltar ao histórico
          </Link>
        </div>
      </main>
    );
  }

  const percentage = run.total > 0 ? Math.round((run.score / run.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/simulations/history"
              className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              <ArrowLeft size={14} /> Histórico
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Revisão do simulado</h1>
            <p className="text-slate-500 dark:text-slate-400">
              Realizado em {formatDate(run.created_at)} · {run.total} questões
            </p>
          </div>
          <div
            className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full text-lg font-bold ${
              percentage >= 70
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
            }`}
          >
            {percentage}%
            <span className="text-xs font-normal">
              {run.score}/{run.total}
            </span>
          </div>
        </header>

        <section className="space-y-4">
          {run.answers.map((answer) => {
            const question = questions[answer.question_id];
            if (!question) return null;
            return (
              <article
                key={answer.question_id}
                className={`rounded-2xl border p-5 dark:border-slate-800 dark:bg-slate-900 ${
                  answer.is_correct
                    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                    : "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {question.discipline}
                  </p>
                  {answer.is_correct ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <CheckCircle2 size={13} /> Correta
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
                      <XCircle size={13} /> Incorreta
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{question.statement}</p>
                <div className="mt-4 space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const isCorrectOption = answer.correct_answer === optionIndex;
                    const isWrongPick = answer.selected_answer === optionIndex && !answer.is_correct;
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
                        {isWrongPick && <span className="ml-2 text-xs text-red-600 dark:text-red-400">(sua resposta)</span>}
                      </p>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Resposta correta: </span>
                  {letterFor(answer.correct_answer)}
                  <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">Sua resposta: </span>
                  {letterFor(answer.selected_answer)}
                </div>
                {question.explanation && (
                  <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Explicação: </span>
                    {question.explanation}
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <div className="flex justify-center pb-4">
          <Link
            href="/simulations"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Fazer novo simulado
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function SimulationReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
          <div className="mx-auto flex max-w-4xl items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        </main>
      }
    >
      <ReviewContent />
    </Suspense>
  );
}