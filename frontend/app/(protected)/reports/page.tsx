"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Flame,
  Loader2,
  Target,
} from "lucide-react";

import { getStatistics, type Statistics } from "@/lib/statistics";
import { getStudyPlan, type StudyPlan } from "@/lib/studies";
import { listSimulations, type SimulationRun } from "@/lib/simulations";
import { Performance7Days } from "@/components/dashboard/Performance7Days";
import { PerformanceByDiscipline } from "@/components/dashboard/PerformanceByDiscipline";

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

type ReportData = {
  statistics: Statistics | null;
  plan: StudyPlan | null;
  simulations: SimulationRun[];
};

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const [statistics, plan, simulations] = await Promise.all([
          getStatistics(),
          getStudyPlan(),
          listSimulations(),
        ]);
        if (!active) return;
        setData({ statistics, plan, simulations });
      } catch {
        if (active) setError("Não foi possível carregar os relatórios.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
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

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              <BarChart3 className="text-blue-600" /> Relatórios
            </h1>
            <p className="text-slate-500 dark:text-slate-400">{error ?? "Sem dados disponíveis."}</p>
          </header>
        </div>
      </main>
    );
  }

  const { statistics, plan, simulations } = data;

  const cards = [
    { label: "Questões respondidas", value: statistics?.total ?? 0, icon: BookOpen, tone: "text-blue-600" },
    { label: "Aproveitamento", value: `${statistics?.accuracy ?? 0}%`, icon: Target, tone: "text-indigo-600" },
    { label: "Sequência de dias", value: `${statistics?.streak ?? 0}d`, icon: Flame, tone: "text-orange-500" },
    {
      label: "Plano: concluído na semana",
      value: plan ? `${plan.weekly_completed}/${plan.weekly_planned}` : "—",
      icon: CheckCircle2,
      tone: "text-emerald-600",
    },
  ];

  const planMinutes =
    plan?.discipline_stats?.reduce((sum, item) => sum + item.actual_minutes, 0) ?? 0;
  const planSessions = plan?.blocks?.filter((block) => block.status !== "pending").length ?? 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <BarChart3 className="text-blue-600" /> Relatórios
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Visão geral do seu desempenho, planejamento de estudos e simulados em um só lugar.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <card.icon size={18} className={card.tone} />
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{card.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
            </article>
          ))}
        </section>

        {statistics && (
          <section className="grid gap-4 lg:grid-cols-2">
            <Performance7Days data={statistics.daily} />
            <PerformanceByDiscipline data={statistics.disciplines} />
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          {plan && (
            <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                  <CalendarCheck2 size={16} className="text-blue-600" /> Planejamento de estudos
                </h2>
                <Link href="/study" className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
                  Abrir plano
                </Link>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/50">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Objetivo</dt>
                  <dd className="mt-0.5 truncate font-semibold text-slate-800 dark:text-slate-100">{plan.goal}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/50">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Disciplinas</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{plan.disciplines.length}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/50">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Tempo registrado</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">
                    {(planMinutes / 60).toFixed(1)}h
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/50">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Atividades concluídas</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{planSessions}</dd>
                </div>
              </dl>
              {plan.review_due > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  {plan.review_due} revisão(ões) pendente(s) de agenda.
                </p>
              )}
            </article>
          )}

          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <ClipboardList size={16} className="text-blue-600" /> Últimos simulados
              </h2>
              <Link href="/simulations/history" className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
                Ver todos
              </Link>
            </div>
            {simulations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">Você ainda não fez simulados.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {simulations.slice(0, 5).map((run) => {
                  const percentage = run.total > 0 ? Math.round((run.score / run.total) * 100) : 0;
                  return (
                    <li key={run.id}>
                      <Link
                        href={`/simulations/review?run=${run.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm transition hover:bg-slate-100 dark:bg-slate-950/50 dark:hover:bg-slate-900"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {run.score} acertos de {run.total}
                          </p>
                          <p className="text-xs text-slate-400">{formatDate(run.created_at)}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                          {percentage}%
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}