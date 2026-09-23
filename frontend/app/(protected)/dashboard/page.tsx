"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock3, X } from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { HeroActions } from "@/components/dashboard/HeroActions";
import { Performance7Days } from "@/components/dashboard/Performance7Days";
import { PerformanceByDiscipline } from "@/components/dashboard/PerformanceByDiscipline";
import { QuickLinks } from "@/components/dashboard/QuickLinks";
import { useMe } from "@/lib/useMe";
import { getStatistics, Statistics } from "@/lib/statistics";

export default function DashboardPage() {
  const { me, isLoading } = useMe();
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    void getStatistics()
      .then(setStatistics)
      .catch(() => setStatistics(null))
      .finally(() => setStatsLoading(false));
  }, []);

  const firstName = useMemo(() => {
    if (!me) return "estudante";
    return me.first_name?.trim() || me.username || "estudante";
  }, [me]);
  const number = (value: number | undefined) => statsLoading ? "—" : String(value ?? 0);
  const recent = statistics?.recent_activity?.slice(0, 4) ?? [];

  return (
    <main className="dashboard-page min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto max-w-[1440px] space-y-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <HeroActions name={isLoading ? "estudante" : firstName} todayTotal={statistics?.today_total ?? 0} streak={statistics?.streak ?? 0} />

        <section aria-labelledby="overview-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div><p className="dashboard-eyebrow">Seu progresso</p><h2 id="overview-title" className="dashboard-heading mt-1 text-xl font-bold sm:text-2xl">Um passo de cada vez</h2></div>
            <p className="dashboard-muted text-sm">Seus resultados em um só lugar</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard title="Questões hoje" value={number(statistics?.today_total)} subtitle="Respondidas neste dia" icon="📄" iconBg="bg-blue-600" />
            <StatsCard title="Taxa de acerto" value={statsLoading ? "—" : `${statistics?.accuracy ?? 0}%`} subtitle="Em todas as questões" icon="🎯" iconBg="bg-emerald-600" />
            <StatsCard title="Sequência atual" value={statsLoading ? "—" : `${statistics?.streak ?? 0} dias`} subtitle="Dias consecutivos" icon="🔥" iconBg="bg-orange-500" />
            <StatsCard title="Total resolvido" value={number(statistics?.total)} subtitle="Questões na sua jornada" icon="🏅" iconBg="bg-violet-600" />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
          <div className="space-y-6">
            <Performance7Days data={statistics?.daily ?? []} />
            <PerformanceByDiscipline data={statistics?.disciplines ?? []} />
          </div>
          <div className="space-y-6">
            <QuickLinks />
            <section className="dashboard-panel rounded-2xl border p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><p className="dashboard-eyebrow">Sua jornada</p><h2 className="mt-1 text-lg font-bold">Atividade recente</h2></div>
                <Clock3 className="dashboard-muted" size={20} />
              </div>
              {recent.length ? (
                <ul className="mt-5 space-y-3">
                  {recent.map((activity) => (
                    <li key={activity.id} className="dashboard-activity flex items-center gap-3 rounded-xl border p-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${activity.is_correct ? "dashboard-result-correct" : "dashboard-result-incorrect"}`}>
                        {activity.is_correct ? <Check size={17} /> : <X size={17} />}
                      </span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{activity.discipline || "Questão respondida"}</span><span className="dashboard-muted text-xs">{activity.is_correct ? "Resposta correta" : "Revisar resposta"}</span></span>
                      <span className="dashboard-muted shrink-0 text-xs">{new Date(activity.date).toLocaleDateString("pt-BR")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="dashboard-empty mt-5 rounded-xl border p-5 text-center">
                  <p className="font-semibold">{statsLoading ? "Carregando atividade..." : "Sua jornada começa aqui"}</p>
                  <p className="dashboard-muted mt-1 text-sm">Resolva uma questão para acompanhar seus resultados.</p>
                </div>
              )}
              <Link href="/questions" className="dashboard-text-link mt-5 inline-flex items-center gap-2 text-sm font-semibold">Ir para questões <ArrowRight size={16} /></Link>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
