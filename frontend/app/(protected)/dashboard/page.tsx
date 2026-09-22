"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppFooter } from "@/components/layout/AppFooter";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { HeroActions } from "@/components/dashboard/HeroActions";
import { Performance7Days } from "@/components/dashboard/Performance7Days";
import { PerformanceByDiscipline } from "@/components/dashboard/PerformanceByDiscipline";
import { AppearanceCard } from "@/components/dashboard/AppearanceCard";
import { QuickLinks } from "@/components/dashboard/QuickLinks";
import { useMe } from "@/lib/useMe";
import { getStatistics, Statistics } from "@/lib/statistics";

export default function DashboardPage() {
  const router = useRouter();
  const { me, isLoading } = useMe();
  const [statistics, setStatistics] = useState<Statistics | null>(null);

  useEffect(() => {
    void getStatistics().then(setStatistics).catch(() => setStatistics(null));
  }, []);

  const fullName = useMemo(() => {
    if (!me) return "Usuário";
    const name = `${me.first_name || ""} ${me.last_name || ""}`.trim();
    return name || me.username || "Usuário";
  }, [me]);

  const resolveNow = () => {
    router.push("/questions");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-6">
          <HeroActions
            greeting={isLoading ? "Carregando..." : `Boa tarde, ${fullName}!`}
            quote="A persistência transforma sonhos em conquistas. Você está no caminho certo."
            onResolve={resolveNow}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Questões Hoje"
              value={String(statistics?.today_total ?? 0)}
              subtitle="Tentativas realizadas hoje"
              icon="📄"
              iconBg="bg-blue-600"
            />
            <StatsCard
              title="Taxa de Acerto"
              value={`${statistics?.accuracy ?? 0}%`}
              subtitle="Média geral"
              icon="🎯"
              iconBg="bg-green-600"
            />
            <StatsCard
              title="Streak Atual"
              value={`${statistics?.streak ?? 0} dias`}
              subtitle="Dias consecutivos"
              icon="🔥"
              iconBg="bg-orange-500"
            />
            <StatsCard
              title="Total de Questões"
              value={String(statistics?.total ?? 0)}
              subtitle="Questões resolvidas"
              icon="🏅"
              iconBg="bg-purple-600"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Performance7Days data={statistics?.daily ?? []} />
              <PerformanceByDiscipline data={statistics?.disciplines ?? []} />
            </div>

            <div className="space-y-6">
              <AppearanceCard />
              <QuickLinks />
            </div>
          </div>
        </div>

        <AppFooter onResolveNow={resolveNow} />
      </div>
    </div>
  );
}
