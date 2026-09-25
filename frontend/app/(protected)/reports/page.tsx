"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Database,
  Filter,
  Flame,
  Loader2,
  Target,
  XCircle,
} from "lucide-react";

import {
  getStatistics,
  type DailyPerformance,
  type Statistics,
  type StatisticsFilters,
} from "@/lib/statistics";
import { getStudyPlan, getStudyPlans, type StudyPlan } from "@/lib/studies";
import { listSimulations, type SimulationRun } from "@/lib/simulations";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function formatDateLong(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "all", label: "Todo o período" },
  { value: "custom", label: "Período personalizado" },
];

type ReportData = {
  statistics: Statistics | null;
  plan: StudyPlan | null;
  simulations: SimulationRun[];
};

type Meta = { disciplines: string[]; bancas: string[] };

function DailyChart({
  data,
  rangeLabel,
}: {
  data: DailyPerformance[];
  rangeLabel: string;
}) {
  const max = Math.max(...data.map((item) => item.total), 1);
  const days = data.length;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Evolução diária
        </h2>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
          {rangeLabel}
        </span>
      </div>
      <div
        className="mt-6 flex h-48 items-end gap-2 sm:gap-3"
        aria-label="Questões respondidas por dia"
      >
        {data.map((item) => (
          <div
            key={item.date}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            title={`${formatDateLong(item.date)} — ${item.total} questão(ões), ${item.accuracy}% de acerto`}
          >
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {item.total}
            </span>
            <div
              className="relative w-full max-w-12 overflow-hidden rounded-t-md bg-blue-100 dark:bg-blue-950"
              style={{
                height: `${Math.max(item.total ? 12 : 2, (item.total * 120) / max)}px`,
              }}
            >
              <div
                className="absolute bottom-0 w-full bg-green-500"
                style={{ height: `${item.accuracy}%` }}
              />
            </div>
            <span className="text-[10px] capitalize text-slate-500 sm:text-xs">
              {days > 31
                ? formatDate(item.date)
                : new Date(`${item.date}T12:00:00`)
                    .toLocaleDateString("pt-BR", { weekday: "short" })
                    .replace(".", "")}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span>■ Atividade</span>
        <span className="text-green-600">■ Acertos</span>
      </div>
    </section>
  );
}

function BreakdownTable({
  title,
  rows,
  nameKey,
}: {
  title: string;
  rows: { name: string; total: number; correct: number; incorrect: number; accuracy: number }[];
  nameKey: "discipline" | "banca";
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          Nenhuma resposta no período selecionado.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-130 text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="pb-2 font-medium">
                  {nameKey === "discipline" ? "Disciplina" : "Banca"}
                </th>
                <th className="pb-2 text-right font-medium">Respondidas</th>
                <th className="pb-2 text-right font-medium">Corretas</th>
                <th className="pb-2 text-right font-medium">Incorretas</th>
                <th className="pb-2 text-right font-medium">Aproveitamento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.name}-${index}`}
                  className="border-b border-slate-50 last:border-0 dark:border-slate-800/50"
                >
                  <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                    {row.name || "(sem registro)"}
                  </td>
                  <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{row.total}</td>
                  <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400">{row.correct}</td>
                  <td className="py-2.5 text-right text-red-500 dark:text-red-400">{row.incorrect}</td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex min-w-12 justify-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                      {row.accuracy}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customDirty, setCustomDirty] = useState(false);
  const [discipline, setDiscipline] = useState("");
  const [banca, setBanca] = useState("");
  const [filters, setFilters] = useState<StatisticsFilters>({});

  useEffect(() => {
    let active = true;
    getStatistics()
      .then((all) => {
        if (!active) return;
        setMeta({
          disciplines: all.disciplines.map((d) => d.discipline),
          bancas: all.bancas.map((b) => b.banca),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const buildFilters = useMemo(() => {
    const today = new Date();
    return (): StatisticsFilters => {
      const next: StatisticsFilters = {};
      if (period === "7") {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        next.start_date = toDateStr(start);
        next.end_date = toDateStr(today);
      } else if (period === "30") {
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        next.start_date = toDateStr(start);
        next.end_date = toDateStr(today);
      } else if (period === "month") {
        next.start_date = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
        next.end_date = toDateStr(today);
      } else if (period === "custom" && customDirty) {
        if (customStart) next.start_date = customStart;
        if (customEnd) next.end_date = customEnd;
      }
      if (discipline) next.discipline = discipline;
      if (banca) next.banca = banca;
      return next;
    };
  }, [period, customDirty, customStart, customEnd, discipline, banca]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const [statistics, summaries, simulations] = await Promise.all([
          getStatistics(filters),
          getStudyPlans(),
          listSimulations(),
        ]);
        const chosen = summaries.find((item) => item.active) ?? summaries[0] ?? null;
        const plan = chosen ? await getStudyPlan(chosen.id) : null;
        if (!active) return;
        setData({ statistics, plan, simulations });
        setError(null);
      } catch {
        if (active) setError("Não foi possível carregar os relatórios.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filters]);

  const applyFilters = () => {
    setFilters(buildFilters());
  };

  const clearFilters = () => {
    setPeriod("30");
    setCustomStart("");
    setCustomEnd("");
    setCustomDirty(false);
    setDiscipline("");
    setBanca("");
    setFilters({
      start_date: toDateStr(new Date(Date.now() - 29 * 86400000)),
      end_date: toDateStr(new Date()),
    });
  };

  const activeFilterCount = [
    period !== "30" ? "período" : "",
    discipline ? "disciplina" : "",
    banca ? "banca" : "",
  ].filter(Boolean).length;

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl space-y-6">
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

  const rangeLabel = (() => {
    if (filters.start_date || filters.end_date) {
      if (filters.start_date && filters.end_date && filters.start_date === filters.end_date) {
        return formatDateLong(filters.start_date);
      }
      return `${filters.start_date ? formatDateLong(filters.start_date) : "início"} – ${
        filters.end_date ? formatDateLong(filters.end_date) : "hoje"
      }`;
    }
    return "Todo o período";
  })();

  const cards = [
    { label: "Respondidas", value: statistics?.total ?? 0, icon: BookOpen, tone: "text-blue-600" },
    { label: "Corretas", value: statistics?.correct ?? 0, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Incorretas", value: statistics?.incorrect ?? 0, icon: XCircle, tone: "text-red-500" },
    { label: "Aproveitamento", value: `${statistics?.accuracy ?? 0}%`, icon: Target, tone: "text-indigo-600" },
    { label: "Sequência (streak)", value: `${statistics?.streak ?? 0}d`, icon: Flame, tone: "text-orange-500" },
    {
      label: "Plano: concluído na semana",
      value: plan ? `${plan.weekly_completed}/${plan.weekly_planned}` : "—",
      icon: CalendarCheck2,
      tone: "text-blue-600",
    },
  ];

  const planMinutes =
    plan?.discipline_stats?.reduce((sum, item) => sum + item.actual_minutes, 0) ?? 0;
  const planSessions = plan?.blocks?.filter((block) => block.status !== "pending").length ?? 0;

  const disciplinesRows = (statistics?.disciplines ?? []).map((d) => ({
    name: d.discipline,
    total: d.total,
    correct: d.correct,
    incorrect: d.incorrect,
    accuracy: d.accuracy,
  }));
  const bancasRows = (statistics?.bancas ?? []).map((b) => ({
    name: b.banca,
    total: b.total,
    correct: b.correct,
    incorrect: b.incorrect,
    accuracy: b.accuracy,
  }));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <BarChart3 className="text-blue-600" /> Relatórios
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Acompanhe seu desempenho em detalhes e filtre por período, disciplina e banca.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Filter size={14} /> Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                {activeFilterCount} ativo(s)
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Período</span>
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Disciplina</span>
              <select
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Todas as disciplinas</option>
                {(meta?.disciplines ?? []).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Banca</span>
              <select
                value={banca}
                onChange={(event) => setBanca(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Todas as bancas</option>
                {(meta?.bancas ?? []).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button
                onClick={applyFilters}
                className="h-10 flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98]"
                type="button"
              >
                Aplicar
              </button>
              <button
                onClick={clearFilters}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                type="button"
                title="Limpar filtros"
              >
                Limpar
              </button>
            </div>
          </div>

          {period === "custom" && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">De</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => {
                    setCustomStart(event.target.value);
                    setCustomDirty(true);
                  }}
                  className="mt-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Até</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => {
                    setCustomEnd(event.target.value);
                    setCustomDirty(true);
                  }}
                  className="mt-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <button
                onClick={applyFilters}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                type="button"
              >
                Aplicar datas
              </button>
            </div>
          )}
        </section>

        <section className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-slate-50/60 pt-16 backdrop-blur-[2px] dark:bg-slate-950/60">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
                <DailyChart data={statistics.daily} rangeLabel={rangeLabel} />
                <BreakdownTable title="Desempenho por disciplina" rows={disciplinesRows} nameKey="discipline" />
              </section>
            )}

            {statistics && (
              <section className="grid gap-4 lg:grid-cols-2">
                <BreakdownTable title="Desempenho por banca" rows={bancasRows} nameKey="banca" />
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Atividade recente</h2>
                  <ul className="mt-4 space-y-3">
                    {statistics.recent_activity.length === 0 ? (
                      <li className="text-sm text-slate-400">
                        Nenhuma resolução no período selecionado.
                      </li>
                    ) : (
                      statistics.recent_activity.slice(0, 10).map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-950/50"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-700 dark:text-slate-200">{item.discipline}</p>
                            <p className="text-xs text-slate-400">
                              Questão {item.question_id} · {item.banca || "sem banca"} · {formatDate(item.date)}
                            </p>
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
              </section>
            )}

            <section className="grid gap-4 lg:grid-cols-2">
              {plan && (
                <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Database size={12} /> Valores considerados do período selecionado. Streak e plano não seguem o filtro de datas.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}