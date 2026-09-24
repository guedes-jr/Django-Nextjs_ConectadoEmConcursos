"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock, History, Loader2, Play, SearchX, Trophy } from "lucide-react";

import { listSimulations, SimulationRun } from "@/lib/simulations";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function SimulationsHistoryPage() {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listSimulations();
        if (!cancelled) setRuns(data);
      } catch {
        if (!cancelled) setError("Não foi possível carregar o histórico de simulados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-5xl items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Histórico de simulações</h1>
            <p className="text-slate-500 dark:text-slate-400">Todos os simulados que você já realizou.</p>
          </div>
          <Link
            href="/simulations"
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Play size={15} /> Novo simulado
          </Link>
        </header>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {runs.length === 0 && !error ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <History className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">Nenhum simulado ainda</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Monte seu primeiro simulado com questões de provas anteriores e receba a correção na hora.
            </p>
            <Link
              href="/simulations"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Play size={15} /> Criar simulado
            </Link>
          </section>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {runs.map((run) => {
              const percentage = run.total > 0 ? Math.round((run.score / run.total) * 100) : 0;
              const canReview = run.status === "finished";
              return (
                <article
                  key={run.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {run.score} <span className="text-slate-400">de {run.total}</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <Trophy size={12} className="mr-1 inline text-amber-500" />
                        {percentage}% de acerto
                      </p>
                    </div>
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold ${
                        percentage >= 70
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
                      }`}
                    >
                      {percentage}%
                    </div>
                  </div>
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Clock size={12} /> {formatDate(run.created_at)} às {formatTime(run.created_at)}
                  </p>
                  {!canReview && (
                    <p className="mt-2">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
                        Expirado
                      </span>
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {run.discipline && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                        {run.discipline}
                      </span>
                    )}
                    {run.banca && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                        {run.banca}
                      </span>
                    )}
                    {run.year && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                        {run.year}
                      </span>
                    )}
                    {run.time_limit_minutes && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                        até {run.time_limit_minutes} min
                      </span>
                    )}
                  </p>
                  <Link
                    href={`/simulations/review?run=${run.id}`}
                    aria-disabled={!canReview}
                    className={`mt-4 inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 ${
                      canReview ? "hover:bg-blue-50 dark:hover:bg-slate-800" : "pointer-events-none opacity-60"
                    }`}
                  >
                    {canReview ? "Revisar questões" : "Sem correção"}
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        {runs.length === 0 && !error && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <SearchX size={13} /> Nada para exibir por aqui.
          </p>
        )}
      </div>
    </main>
  );
}