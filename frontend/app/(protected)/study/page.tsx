"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, RotateCcw, Settings2, Target } from "lucide-react";
import { listQuestionDisciplines } from "@/lib/questions";
import { useMe } from "@/lib/useMe";
import { getStudyPlan, recordStudySession, replanStudy, saveStudyPlan, updateStudyBlock, type PlanInput, type StudyBlock, type StudyPlan } from "@/lib/studies";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const KIND = { theory: "Teoria", questions: "Questões", review: "Revisão" };
const goals = ["Técnico Judiciário", "Analista Judiciário", "Policial Civil", "Professor", "Área Administrativa", "Outro objetivo"];
const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900";

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
}
function dateString(date: Date) {
  const year = date.getFullYear();
  return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function errorText(error: unknown) {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (data) return Object.values(data).flat().join(" ");
  return "Não foi possível salvar. Tente novamente.";
}

export default function StudyPage() {
  const { me } = useMe();
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [week, setWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const [actualMinutes, setActualMinutes] = useState("");
  const [form, setForm] = useState<PlanInput>({ goal: "", exam_date: null, disciplines: [], weekdays: [0, 1, 2, 3, 4], minutes_per_day: 60 });

  const refresh = useCallback(async (selectedWeek = week) => {
    setLoading(true);
    try { setPlan(await getStudyPlan(selectedWeek)); setMessage(""); }
    catch (error) { setMessage(errorText(error)); }
    finally { setLoading(false); }
  }, [week]);

  useEffect(() => { void refresh(week); }, [refresh, week]);
  useEffect(() => { void listQuestionDisciplines().then(setDisciplines).catch(() => setDisciplines([])); }, []);
  useEffect(() => {
    if (plan || !me) return;
    setForm((current) => ({ ...current, goal: current.goal || me.target_role || "", minutes_per_day: current.minutes_per_day === 60 && me.study_hours_per_day ? Math.min(480, me.study_hours_per_day * 60) : current.minutes_per_day, disciplines: current.disciplines.length ? current.disciplines : me.disciplines.filter((item) => disciplines.includes(item)).slice(0, 12) }));
  }, [plan, me, disciplines]);

  const today = dateString(new Date());
  const todayBlocks = useMemo(() => plan?.blocks.filter((item) => item.date === today && item.status !== "done").slice(0, 3) || [], [plan, today]);
  const upcoming = useMemo(() => plan?.blocks.filter((item) => item.date >= today && item.status === "pending").slice(0, 3) || [], [plan, today]);
  const days = useMemo(() => {
    if (!plan) return [];
    const start = new Date(`${plan.week_start}T12:00:00`);
    return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return dateString(date); });
  }, [plan]);

  function beginEdit() {
    if (!plan) return;
    setForm({ goal: plan.goal, exam_date: plan.exam_date, disciplines: plan.disciplines, weekdays: plan.weekdays, minutes_per_day: plan.minutes_per_day });
    setEditing(true);
  }
  async function submitPlan(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try { await saveStudyPlan(form, Boolean(plan)); setEditing(false); setWeek(0); await refresh(0); }
    catch (error) { setMessage(errorText(error)); }
    finally { setSaving(false); }
  }
  async function setStatus(item: StudyBlock, status: StudyBlock["status"]) {
    try { await updateStudyBlock(item.id, { status }); await refresh(); }
    catch (error) { setMessage(errorText(error)); }
  }
  async function moveBlock(item: StudyBlock, date: string) {
    try { await updateStudyBlock(item.id, { date }); await refresh(); }
    catch (error) { setMessage(errorText(error)); }
  }
  async function completeBlock(item: StudyBlock) {
    const minutes = Number(actualMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) { setMessage("Informe entre 1 e 480 minutos estudados."); return; }
    try { await recordStudySession(item.id, minutes); setActiveBlock(null); setActualMinutes(""); await refresh(); }
    catch (error) { setMessage(errorText(error)); }
  }
  async function redistribute() {
    try { const result = await replanStudy(); await refresh(); setMessage(`${result.rescheduled} atividade(s) pendente(s) redistribuída(s).`); }
    catch (error) { setMessage(errorText(error)); }
  }

  const input = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
  const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition";

  return <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-bold uppercase tracking-[.15em] text-blue-600 dark:text-blue-400">Área de estudos</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Planejamento de estudos</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Um próximo passo claro para cada dia, ajustado ao seu ritmo.</p></div>
        {plan && !editing && <button type="button" onClick={beginEdit} className={`${button} border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900`}><Settings2 size={17} /> Ajustar plano</button>}
      </header>
      {message && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">{message}</div>}
      {loading && !plan && !editing ? <div className={card}>Carregando seu planejamento...</div> : (!plan || editing) ? <form onSubmit={(event) => void submitPlan(event)} className={`${card} max-w-3xl space-y-6`}>
        <div><h2 className="text-xl font-bold">{editing ? "Ajustar meu plano" : "Crie seu plano em poucos passos"}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Você poderá mudar estas escolhas depois.</p></div>
        <div><label htmlFor="goal" className="mb-2 block text-sm font-semibold">Objetivo ou carreira</label><input id="goal" list="study-goals" value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} className={input} placeholder="Ex.: Técnico Judiciário" maxLength={160} required /><datalist id="study-goals">{goals.map((goal) => <option key={goal} value={goal} />)}</datalist></div>
        <div><label htmlFor="exam-date" className="mb-2 block text-sm font-semibold">Data da prova <span className="font-normal text-slate-500">(opcional)</span></label><input id="exam-date" type="date" min={today} value={form.exam_date || ""} onChange={(event) => setForm({ ...form, exam_date: event.target.value || null })} className={input} /></div>
        <fieldset><legend className="mb-2 text-sm font-semibold">Disciplinas</legend><div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-2">{disciplines.map((discipline) => <label key={discipline} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><input type="checkbox" checked={form.disciplines.includes(discipline)} onChange={(event) => setForm({ ...form, disciplines: event.target.checked ? [...form.disciplines, discipline] : form.disciplines.filter((value) => value !== discipline) })} />{discipline}</label>)}</div>{disciplines.length === 0 && <p className="mt-2 text-sm text-slate-500">Nenhuma disciplina disponível na base de questões.</p>}</fieldset>
        <fieldset><legend className="mb-2 text-sm font-semibold">Dias disponíveis</legend><div className="flex flex-wrap gap-2">{DAYS.map((day, index) => <label key={day} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold ${form.weekdays.includes(index) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-700"}`}><input className="sr-only" type="checkbox" checked={form.weekdays.includes(index)} onChange={(event) => setForm({ ...form, weekdays: event.target.checked ? [...form.weekdays, index].sort() : form.weekdays.filter((value) => value !== index) })} />{day}</label>)}</div></fieldset>
        <div><label htmlFor="minutes" className="mb-2 block text-sm font-semibold">Minutos disponíveis por dia</label><input id="minutes" type="number" min={25} max={480} value={form.minutes_per_day} onChange={(event) => setForm({ ...form, minutes_per_day: Number(event.target.value) })} className={`${input} max-w-40`} /></div>
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={saving || form.disciplines.length === 0 || form.weekdays.length === 0} className={`${button} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>{saving ? "Salvando..." : editing ? "Salvar ajustes" : "Criar meu plano"}<ArrowRight size={17} /></button>{editing && <button type="button" onClick={() => setEditing(false)} className={`${button} border border-slate-300 dark:border-slate-700`}>Cancelar</button>}</div>
      </form> : <>
        <section className={`${card} flex flex-wrap items-center justify-between gap-4`}><div><div className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400"><Target size={17} /> Meu objetivo</div><h2 className="mt-1 text-2xl font-bold">{plan.goal}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan.disciplines.length} disciplinas · {plan.weekdays.length} dias por semana · {plan.minutes_per_day} min por dia{plan.exam_date ? ` · Prova em ${new Date(`${plan.exam_date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p></div><Link href="/questions" className={`${button} bg-blue-600 text-white hover:bg-blue-700`}>Resolver questões <ArrowRight size={17} /></Link></section>
        <section className="grid gap-4 sm:grid-cols-3"><div className={card}><p className="text-sm text-slate-500 dark:text-slate-400">Atividades concluídas na semana</p><p className="mt-2 text-3xl font-bold">{plan.weekly_completed}<span className="text-lg text-slate-400">/{plan.weekly_planned}</span></p><div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${plan.weekly_planned ? plan.weekly_completed / plan.weekly_planned * 100 : 0}%` }} /></div></div><div className={card}><p className="text-sm text-slate-500 dark:text-slate-400">Questões respondidas</p><p className="mt-2 text-3xl font-bold">{plan.weekly_answers}</p><p className="mt-1 text-xs text-slate-500">{plan.weekly_correct} acertos nesta semana</p></div><div className={card}><p className="text-sm text-slate-500 dark:text-slate-400">Revisões pendentes</p><p className="mt-2 text-3xl font-bold">{plan.review_due}</p><Link href="/questions?progress=review" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400">Revisar agora <ArrowRight size={14} /></Link></div></section>
        {week === 0 && <section className={card}><div className="flex items-center gap-2"><Clock3 size={19} className="text-blue-600" /><h2 className="text-lg font-bold">O que estudar hoje</h2></div>{todayBlocks.length ? <div className="mt-4 grid gap-3 md:grid-cols-3">{todayBlocks.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{KIND[item.kind]} · {item.planned_minutes} min</p><h3 className="mt-1 font-semibold">{item.discipline}</h3>{item.kind !== "theory" ? <Link href={`/questions?discipline=${encodeURIComponent(item.discipline)}${item.kind === "review" ? "&progress=review" : ""}`} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400">Começar <ArrowRight size={15} /></Link> : <button type="button" onClick={() => { setActiveBlock(item.id); setActualMinutes(String(item.planned_minutes)); }} className="mt-3 text-sm font-bold text-blue-600 dark:text-blue-400">Registrar estudo</button>}</div>)}</div> : <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Sem atividades pendentes hoje. {upcoming.length ? `Próxima: ${dayLabel(upcoming[0].date)}.` : "Aproveite para descansar ou revisar questões."}</p>}</section>}
        <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarDays size={19} className="text-blue-600" /><h2 className="text-lg font-bold">Minha semana</h2></div><div className="flex gap-2"><button type="button" onClick={() => void redistribute()} className={`${button} border border-slate-300 dark:border-slate-700`}><RotateCcw size={15} /> Redistribuir pendências</button><button type="button" disabled={week === 0} onClick={() => setWeek(week - 1)} aria-label="Semana anterior" className={`${button} border border-slate-300 disabled:opacity-40 dark:border-slate-700`}><ChevronLeft size={17} /></button><button type="button" disabled={week === 12} onClick={() => setWeek(week + 1)} aria-label="Próxima semana" className={`${button} border border-slate-300 disabled:opacity-40 dark:border-slate-700`}><ChevronRight size={17} /></button></div></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-7">{days.map((day) => <div key={day} className={`min-h-40 rounded-xl border p-3 ${day === today ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"}`}><h3 className="text-sm font-bold capitalize">{dayLabel(day)}</h3><div className="mt-3 space-y-2">{plan.blocks.filter((item) => item.date === day).map((item) => <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-1"><span className="font-semibold">{KIND[item.kind]}</span>{item.status === "done" && <Check size={14} className="text-emerald-600" />}</div><p className="mt-1 break-words text-slate-600 dark:text-slate-300">{item.discipline}</p><p className="mt-1 text-slate-500">{item.planned_minutes} min{item.actual_minutes ? ` · ${item.actual_minutes} feitos` : ""}{item.answered_questions ? ` · ${item.answered_questions} questões` : ""}</p>{item.status === "pending" && <div className="mt-2 flex flex-wrap gap-1"><button type="button" onClick={() => { setActiveBlock(item.id); setActualMinutes(String(item.planned_minutes)); }} className="font-semibold text-blue-600 dark:text-blue-400">Concluir</button><button type="button" onClick={() => void setStatus(item, "skipped")} className="text-slate-500">Adiar</button></div>}{item.status === "skipped" && <button type="button" onClick={() => void setStatus(item, "pending")} className="mt-2 font-semibold text-blue-600">Retomar</button>}<label className="mt-2 block text-slate-500">Mover para <input type="date" min={today} value={item.date} onChange={(event) => void moveBlock(item, event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" /></label></div>)}{!plan.blocks.some((item) => item.date === day) && <p className="text-xs text-slate-400">Livre</p>}</div></div>)}</div>
        </section>
        <section className={card}><div className="flex items-center gap-2"><BookOpen size={18} className="text-blue-600" /><h2 className="text-lg font-bold">Disciplinas nesta semana</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{plan.discipline_stats.map((item) => <Link key={item.discipline} href={`/questions?discipline=${encodeURIComponent(item.discipline)}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-400 dark:border-slate-700"><h3 className="font-bold">{item.discipline}</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.completed}/{item.total} atividades · {item.actual_minutes}/{item.planned_minutes} min</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.answered} questões · {item.correct} acertos</p></Link>)}</div></section>
      </>}
    </div>
    {activeBlock !== null && <div role="dialog" aria-modal="true" aria-label="Registrar estudo" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"><div className={`${card} w-full max-w-sm`}><h2 className="text-lg font-bold">Registrar estudo</h2><p className="mt-1 text-sm text-slate-500">Quanto tempo você estudou de fato?</p><label htmlFor="actual-minutes" className="mt-4 block text-sm font-semibold">Minutos estudados</label><input id="actual-minutes" type="number" min={1} max={480} value={actualMinutes} onChange={(event) => setActualMinutes(event.target.value)} className={`${input} mt-2`} /><div className="mt-5 flex gap-2"><button type="button" onClick={() => { const item = plan?.blocks.find((block) => block.id === activeBlock); if (item) void completeBlock(item); }} className={`${button} bg-blue-600 text-white`}>Concluir atividade</button><button type="button" onClick={() => setActiveBlock(null)} className={`${button} border border-slate-300 dark:border-slate-700`}>Cancelar</button></div></div></div>}
  </main>;
}
