"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Play,
  RefreshCw,
  Trophy,
  XCircle,
} from "lucide-react";

import { getQuizBySlug, type QuizQuestion } from "@/lib/quizzes";

function letterFor(index: number) {
  return `${String.fromCharCode(97 + index)})`;
}

export default function QuizPage() {
  const params = useParams<{ slug: string }>();
  const quiz = getQuizBySlug(params.slug);

  const [step, setStep] = useState<"intro" | "playing" | "result">("intro");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [choices, setChoices] = useState<Array<number | null>>([]);

  if (!quiz) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl space-y-6">
          <header className="flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              <BookOpen className="text-blue-600" /> Quiz não encontrado
            </h1>
            <p className="text-slate-500 dark:text-slate-400">Não existe um quiz para esta disciplina.</p>
          </header>
          <Link
            href="/questions"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft size={15} /> Ir para questões
          </Link>
        </div>
      </main>
    );
  }

  const question: QuizQuestion = quiz.questions[index];
  const total = quiz.questions.length;
  const answeredCount = choices.filter((value) => value !== null).length;
  const score = quiz.questions.reduce(
    (sum, item, i) => sum + (choices[i] === item.answer ? 1 : 0),
    0,
  );
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  const start = () => {
    setChoices(new Array(total).fill(null));
    setIndex(0);
    setSelected(null);
    setAnswered(false);
    setStep("playing");
  };

  const choose = (optionIndex: number) => {
    if (answered) return;
    setSelected(optionIndex);
    setAnswered(true);
    setChoices((current) => {
      const next = [...current];
      next[index] = optionIndex;
      return next;
    });
  };

  const next = () => {
    if (index < total - 1) {
      setIndex((current) => current + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      setStep("result");
    }
  };

  const renderQuestion = () => (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          {quiz.title}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Questão {index + 1} de {total}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{question.question}</p>

      <div className="mt-6 space-y-3">
        {question.options.map((option, optionIndex) => {
          const isCorrect = answered && optionIndex === question.answer;
          const isWrongPick = answered && selected === optionIndex && optionIndex !== question.answer;
          return (
            <button
              key={optionIndex}
              type="button"
              onClick={() => choose(optionIndex)}
              disabled={answered}
              className={`flex w-full items-baseline gap-2 rounded-xl p-4 text-left transition ${
                isCorrect || isWrongPick ? "" : "hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <span
                className={`inline-flex h-5 shrink-0 items-center justify-center rounded-lg px-3 text-xs font-bold leading-none ${
                  isCorrect
                    ? "bg-emerald-600 text-white"
                    : isWrongPick
                      ? "bg-red-600 text-white"
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

      {answered && (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {selected === question.answer ? (
              <>
                <CheckCircle2 size={16} className="text-emerald-600" /> Correto!
              </>
            ) : (
              <>
                <XCircle size={16} className="text-red-500" /> Incorreto
              </>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Explicação: </span>
            {question.explanation}
          </p>
        </div>
      )}
    </section>
  );

  if (step === "playing") {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{quiz.title}</h1>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {answeredCount} de {total} respondidas
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${((index + 1) / total) * 100}%` }}
              />
            </div>
          </header>

          {renderQuestion()}

          <footer className="flex justify-end">
            <button
              type="button"
              onClick={next}
              disabled={!answered}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {index < total - 1 ? (
                <>
                  Próxima <ArrowRight size={15} />
                </>
              ) : (
                <>
                  Ver resultado <Trophy size={15} />
                </>
              )}
            </button>
          </footer>
        </div>
      </main>
    );
  }

  if (step === "result") {
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
            <p className="mt-1 text-slate-500 dark:text-slate-400">{quiz.title}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <RefreshCw size={15} /> Refazer quiz
              </button>
              <Link
                href="/questions"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
              >
                <ArrowRight size={15} /> Praticar questões
              </Link>
            </div>
          </section>

          <section className="space-y-4">
            {quiz.questions.map((item, i) => {
              const pick = choices[i];
              const isCorrect = pick === item.answer;
              return (
                <article
                  key={i}
                  className={`rounded-2xl border p-5 dark:border-slate-800 dark:bg-slate-900 ${
                    isCorrect
                      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                      : "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {i + 1}. {item.question}
                    </p>
                    {isCorrect ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        <CheckCircle2 size={13} /> Correta
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
                        <XCircle size={13} /> Incorreta
                      </span>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {item.options.map((option, optionIndex) => {
                      const isCorrectOption = optionIndex === item.answer;
                      const isWrongPick = pick === optionIndex && !isCorrectOption;
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
                  <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Explicação: </span>
                    {item.explanation}
                  </p>
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
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <BookOpen className="text-blue-600" /> {quiz.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">{quiz.description}</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
            <BookOpen size={30} />
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">questões com explicação das respostas</p>
          <button
            type="button"
            onClick={start}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 sm:w-auto"
          >
            <Play size={16} />
            Iniciar quiz
          </button>
        </section>
      </div>
    </main>
  );
}