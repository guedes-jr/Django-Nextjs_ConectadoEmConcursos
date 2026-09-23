"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CalendarCheck2,
  CheckCircle2,
  Flame,
  Loader2,
  Target,
  TrendingUp,
} from "lucide-react";

import { getStatistics, type Statistics } from "@/lib/statistics";
import { Performance7Days } from "@/components/dashboard/Performance7Days";
import { PerformanceByDiscipline } from "@/components/dashboard/PerformanceByDiscipline";

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function StatisticsPage() {
  const [data, setData] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getStatistics()
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar as estatísticas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
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
              <TrendingUp className="text-blue-600" /> Minhas Estatísticas
            </h1>
            <p className="text-slate-500 dark:text-slate-400">{error ?? "Sem dados disponíveis."}</p>
          </header>
        </div>
      </main>
    );
  }

  const cards = [
    { label: "Hoje", value: data.today_total, icon: CalendarCheck2, tone: "text-blue-600" },
    { label: "Total respondidas", value: data.total, icon: Activity, tone: "text-slate-600" },
    { label: "Total corretas", value: data.correct, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Aproveitamento", value: `${data.accuracy}%`, icon: Target, tone: "text-indigo-600" },
    { label: "Sequência (streak)", value: `${data.streak}d`, icon: Flame, tone: "text-orange-500" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <TrendingUp className="text-blue-600" /> Minhas Estatísticas
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Últimos 7 dias e Índice de Desempenho Geral (IDG).
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

        <section className="grid gap-4 lg:grid-cols-2">
          <Performance7Days data={data.daily} />
          <PerformanceByDiscipline data={data.disciplines} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Atividade recente</h2>
          <ul className="mt-4 space-y-3">
            {data.recent_activity.length === 0 ? (
              <li className="text-sm text-slate-400">Ainda não há resoluções registradas.</li>
            ) : (
              data.recent_activity.slice(0, 10).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-950/50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{item.discipline}</p>
                    <p className="text-xs text-slate-400">Questão {item.question_id} · {formatDate(item.date)}</p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                      item.is_correct
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                    }`}
                  >
                    {item.is_correct ? "Correta" : "Incorreta"}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}