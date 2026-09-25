"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, ArrowRight, CalendarRange, CheckCircle2, Clock3, ListOrdered, Loader2, Plus, Trash2, TrendingUp, Waypoints } from "lucide-react";
import { getStudyAlerts, getStudyPlans, type PlanKind, type PlanSummary, KIND_LABELS } from "@/lib/studies";

const PEACOCK = [
  { kind: "trilha" as PlanKind, icon: Waypoints, blurb: "Uma sequência semanal pré-definida, com teoria, questões e revisões que se repetem. Ideal para quem gosta de seguir um ritmo pronto." },
  { kind: "cronograma" as PlanKind, icon: CalendarRange, blurb: "Você distribui as disciplinas pelos dias da semana e o plano preenche cada dia até a prova. Ideal para quem quer domínio do próprio calendário." },
  { kind: "ciclo" as PlanKind, icon: ListOrdered, blurb: "Uma fila ordenada de disciplinas que se repete continuamente em ciclos. Todas evoluem juntas até a prova. Ideal para quem estuda várias matérias." },
];

function PlanCard({ plan }: { plan: PlanSummary }) {
  const today = new Date();
  const exam = plan.exam_date ? new Date(`${plan.exam_date}T12:00:00`) : null;
  const daysLeft = exam ? Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / 86400000)) : null;
  const pct = plan.weekly_planned ? Math.round((plan.weekly_completed / plan.weekly_planned) * 100) : 0;
  return (
    <Link href={`/study/plan/${plan.id}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{KIND_LABELS[plan.kind]}</p>
          <h3 className="mt-1 font-bold text-slate-900 dark:text-white">{plan.title || plan.goal}</h3>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">{plan.active ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{plan.goal}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{plan.disciplines.length} disciplinas</span>
        <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{plan.weekdays.length} dias/semana</span>
        <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{plan.minutes_per_day} min/dia</span>
        {daysLeft !== null && <span className="rounded-lg bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">{daysLeft === 0 ? "Prova hoje!" : `${daysLeft} dia${daysLeft > 1 ? "s" : ""} p/ a prova`}</span>}
      </div>
      <div className="mt-4"><div className="flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>Semana atual</span><span>{plan.weekly_completed}/{plan.weekly_planned} atividades {plan.blocks_today ? ` · ${plan.blocks_today} hoje` : ""}</span></div><div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div></div>
    </Link>
  );
}

export default function StudyHomePage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [alerts, setAlerts] = useState<{ blocks_today: number; reviews_due: number; exam_in_days: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [items, alertItems] = await Promise.all([getStudyPlans(), getStudyAlerts()]);
      setPlans(items);
      setAlerts(alertItems);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const grouped = useMemo(() => plans.reduce<Record<PlanKind, PlanSummary[]>>((acc, plan) => {
    acc[plan.kind] = acc[plan.kind] || [];
    acc[plan.kind].push(plan);
    return acc;
  }, { trilha: [], cronograma: [], ciclo: [] }), [plans]);

  const alertsRow = alerts && (alerts.blocks_today > 0 || alerts.reviews_due > 0 || alerts.exam_in_days !== null);
  const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700";

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-bold uppercase tracking-[.15em] text-blue-600 dark:text-blue-400">Área de estudos</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Meus planos de estudo</h1><p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Escolha um método (ou mais de um) e acompanhe seu progresso até a prova.</p></div>
          {plans.length ? <div className="flex flex-wrap gap-2">{(["trilha", "cronograma", "ciclo"] as PlanKind[]).map((kind) => <Link key={kind} href={`/study/new?kind=${kind}`} className={button}><Plus size={16} /> {KIND_LABELS[kind]}</Link>)}</div> : null}
        </header>

        {alertsRow && (
          <section className={`rounded-2xl border p-4 ${alerts.blocks_today > 0 ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300"><AlarmClock size={17} /> Atenção hoje</span>
              {alerts.blocks_today > 0 && <Link href="/study" className="hover:underline"><b>{alerts.blocks_today}</b> atividade{alerts.blocks_today > 1 ? "s" : ""} para estudar</Link>}
              {alerts.reviews_due > 0 && <Link href={`/questions?progress=review`} className="hover:underline"><b>{alerts.reviews_due}</b> revisão{alerts.reviews_due > 1 ? "ões" : ""} pendente{alerts.reviews_due > 1 ? "s" : ""}</Link>}
              {alerts.exam_in_days !== null && <span>{alerts.exam_in_days === 0 ? "Prova hoje" : <><b>{alerts.exam_in_days}</b> dia{alerts.exam_in_days > 1 ? "s" : ""} para a prova</>}</span>}
            </div>
          </section>
        )}

        {loading ? (
          <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-3"><Loader2 className="mx-auto animate-spin text-blue-600" size={28} /><span className="sm:col-span-2 sm:text-left">Carregando seus planos...</span></div>
        ) : plans.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
            <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-bold uppercase tracking-[.15em] text-blue-600 dark:text-blue-400">Comece por aqui</p><h2 className="mt-2 text-2xl font-bold">Qual método combina com você?</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Você pode criar mais de um plano. Todos contam seu tempo e evoluem juntos rumo à prova.</p></div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {PEACOCK.map(({ kind, icon: Icon, blurb }) => (
                <Link key={kind} href={`/study/new?kind=${kind}`} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-600/10 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white dark:text-blue-400"><Icon size={24} /></span>
                  <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{KIND_LABELS[kind]}</h3>
                  <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300">{blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400">{plans.length ? "Criar plano" : "Começar"}<ArrowRight size={15} /></span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <div className="space-y-8">
            {(["trilha", "cronograma", "ciclo"] as PlanKind[]).map((kind) => grouped[kind].length ? (
              <section key={kind}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-bold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400">{(() => { const Icon = PEACOCK.find((item) => item.kind === kind)?.icon ?? Waypoints; return <Icon size={18} />; })()}</span>{KIND_LABELS[kind]}<span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{grouped[kind].length}</span></h2>
                  <Link href={`/study/new?kind=${kind}`} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-700"><Plus size={15} /> Novo</Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{grouped[kind].map((plan) => <PlanCard key={plan.id} plan={plan} />)}<Link href={`/study/new?kind=${kind}`} className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:hover:border-blue-500"><span className="inline-flex items-center gap-2"><Plus size={18} /> Criar {KIND_LABELS[kind].toLowerCase()}</span></Link></div>
              </section>
            ) : null)}
          </div>
        )}

        {plans.length > 0 && (
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><p className="flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400"><TrendingUp size={17} /> Dica</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Use o Pomodoro na página do plano para registrar seus intervalos de foco e descanso do dia.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><p className="flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400"><Trash2 size={17} /> Encerrar</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No plano, você pode excluir um planejamento que não quer mais seguir.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><p className="flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400"><Clock3 size={17} /> Rotina</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Combine trilha + ciclo para manter uma base fixa e, ao mesmo tempo, girar todas as matérias.</p></div>
          </section>
        )}
      </div>
    </main>
  );
}