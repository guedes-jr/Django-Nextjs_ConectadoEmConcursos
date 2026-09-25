"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Coffee, Loader2, Pause, Play, RotateCcw, Settings2, Target, Timer, Trash2 } from "lucide-react";
import { createInterval, deleteStudyPlan, getStudyPlan, listIntervals, getStudyAlerts, recordStudySession, replanStudy, updateStudyBlock, KIND_LABELS, WEEKDAY_SHORT, type StudyBlock, type StudyInterval, type StudyPlan } from "@/lib/studies";

const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const KIND = { theory: "Teoria", questions: "Questões", review: "Revisão" };
const DAYS = WEEKDAY_SHORT;

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
}
function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function errorText(error: unknown) {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (data) return Object.values(data).flat().join(" ");
  return "Algo deu errado. Tente novamente.";
}

function playChime() {
  try {
    const context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [880, 1108.73, 1318.51];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, context.currentTime + index * 0.18);
      gain.gain.linearRampToValueAtTime(0.25, context.currentTime + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + index * 0.18 + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.5);
    });
  } catch {
    /* som indisponível fora do navegador */
  }
}

function Ring({ progress, children }: { progress: number; children: ReactNode }) {
  const size = 128;
  const stroke = 12;
  const radius = (size - stroke) / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));
  return (
    <div className="relative grid h-32 w-32 place-items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-800" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-blue-600 transition-all duration-500" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export default function StudyPlanDetailPage({ params }: { params: { id: string } }) {
  const planId = Number(params.id);
  const router = useRouter();
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [blocks, setBlocks] = useState<Record<string, StudyBlock[]>>({});
  const [week, setWeek] = useState(0);
  const [weekStart, setWeekStart] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeBlock, setActiveBlock] = useState<StudyBlock | null>(null);
  const [actualMinutes, setActualMinutes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [intervals, setIntervals] = useState<StudyInterval[]>([]);
  const [alerts, setAlerts] = useState<{ reviews_due: number; exam_in_days: number | null }>({ reviews_due: 0, exam_in_days: null });

  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [phase, setPhase] = useState<"focus" | "break" | "idle">("idle");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSeconds = phase === "break" ? breakMinutes * 60 : focusMinutes * 60;
  const timerProgress = totalSeconds ? 1 - secondsLeft / totalSeconds : 0;

  const refresh = useCallback(async (selectedWeek = week) => {
    setLoading(true);
    setMessage("");
    try {
      const [item, alertItems] = await Promise.all([
        getStudyPlan(planId, selectedWeek),
        getStudyAlerts(),
      ]);
      setPlan(item);
      setWeek(selectedWeek);
      setWeekStart(item.week_start);
      const grouped = item.blocks.reduce<Record<string, StudyBlock[]>>((acc, block) => {
        acc[block.date] = acc[block.date] || [];
        acc[block.date].push(block);
        return acc;
      }, {});
      setBlocks(grouped);
      setAlerts({ reviews_due: alertItems.reviews_due, exam_in_days: alertItems.exam_in_days });
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [planId, week]);

  const refreshIntervals = useCallback(async () => {
    try { setIntervals(await listIntervals()); } catch { /* timeline opcional */ }
  }, []);

  useEffect(() => { void refresh(week); }, [refresh, week]);
  useEffect(() => { void refreshIntervals(); }, [refreshIntervals]);
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const today = dateString(new Date());
  const days = useMemo(() => {
    if (!weekStart) return [];
    const start = new Date(`${weekStart}T12:00:00`);
    return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return dateString(date); });
  }, [weekStart]);

  const examDays = plan?.exam_date ? Math.max(0, Math.ceil((new Date(`${plan.exam_date}T12:00:00`).getTime() - new Date().getTime()) / 86400000)) : null;
  const todayBlocks = useMemo(() => (week === 0 ? (blocks[today] || []) : []), [blocks, today, week]);
  const pendingToday = todayBlocks.filter((item) => item.status !== "done");

  function startTimer(nextPhase: "focus" | "break") {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase(nextPhase);
    const minutes = nextPhase === "break" ? breakMinutes : focusMinutes;
    setSecondsLeft(minutes * 60);
    setRunning(true);
  }
  function toggleRunning() {
    if (phase === "idle") { void startTimer("focus"); return; }
    setRunning((value) => !value);
  }
  const finishPhase = useCallback(async () => {
    playChime();
    setRunning(false);
    setPhase((previous) => previous === "break" ? "idle" : "break");
    try {
      await createInterval({ plan_id: planId, kind: phase === "break" ? "break" : "focus", minutes: phase === "break" ? breakMinutes : focusMinutes });
      await refreshIntervals();
    } catch { /* intervalo não registrado */ }
  }, [phase, focusMinutes, breakMinutes, planId, refreshIntervals]);
  useEffect(() => {
    if (!running || phase === "idle") return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          void finishPhase();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, phase, finishPhase]);

  const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

  async function updateBlockStatus(item: StudyBlock, status: StudyBlock["status"]) {
    setSaving(true);
    try { await updateStudyBlock(planId, item.id, { status }); await refresh(); } catch (error) { setMessage(errorText(error)); }
    finally { setSaving(false); }
  }
  async function moveBlock(item: StudyBlock, date: string) {
    setSaving(true);
    try { await updateStudyBlock(planId, item.id, { date }); await refresh(); } catch (error) { setMessage(errorText(error)); }
    finally { setSaving(false); }
  }
  async function completeBlock() {
    const minutes = Number(actualMinutes);
    if (!activeBlock) return;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) { setMessage("Informe entre 1 e 480 minutos estudados."); return; }
    setSaving(true);
    try {
      await recordStudySession(planId, activeBlock.id, minutes);
      setActiveBlock(null);
      setActualMinutes("");
      await Promise.all([refresh(), refreshIntervals()]);
    } catch (error) { setMessage(errorText(error)); }
    finally { setSaving(false); }
  }
  async function redistribute() {
    setSaving(true);
    try { const result = await replanStudy(planId); setMessage(`${result.rescheduled} atividade(s) pendente(s) redistribuída(s).`); await refresh(); } catch (error) { setMessage(errorText(error)); }
    finally { setSaving(false); }
  }
  async function removePlan() {
    setSaving(true);
    try { await deleteStudyPlan(planId); router.push("/study"); } catch (error) { setMessage(errorText(error)); setSaving(false); }
  }

  const BUTTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition";
  const focusTotal = intervals.filter((item) => item.kind === "focus").reduce((sum, item) => sum + item.minutes, 0);
  const cycleProgress = plan?.cycle?.length && plan.kind === "ciclo" ? (plan.cycle_index ?? 0) / plan.cycle.length : 0;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {message && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">{message}</div>}

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/study" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700" aria-label="Voltar"><ChevronLeft size={18} /></Link>
              <span className="font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{plan ? KIND_LABELS[plan.kind] : "Plano"}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{plan?.title || plan?.goal || "Carregando..."}</h1>
            {plan && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{plan.disciplines.length} disciplinas · {plan.weekdays.length} dias por semana · {plan.minutes_per_day} min/dia{examDays !== null ? ` · Prova em ${examDays === 0 ? "hoje" : `${examDays} dia(s)`}` : ""}</p>}
          </div>
          {plan && <div className="flex flex-wrap gap-2">
            <Link href={`/study/new?kind=${plan.kind}&id=${plan.id}`} className={`${BUTTON} border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900`}><Settings2 size={17} /> Ajustar</Link>
            <button type="button" disabled={saving} onClick={() => void redistribute()} className={`${BUTTON} border border-slate-300 bg-white disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900`}><RotateCcw size={15} /> Redistribuir pendências</button>
            {!confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className={`${BUTTON} border border-red-200 bg-white text-red-600 dark:border-red-900 dark:bg-slate-900`}><Trash2 size={16} /> Excluir</button> : <span className="flex items-center gap-2"><span className="text-sm font-semibold text-red-600">Excluir plano?</span><button type="button" disabled={saving} onClick={() => void removePlan()} className={`${BUTTON} bg-red-600 text-white disabled:opacity-50`}><Check size={16} /> Sim</button><button type="button" onClick={() => setConfirmDelete(false)} className={`${BUTTON} border border-slate-300 dark:border-slate-700`}>Não</button></span>}
          </div>}
        </header>

        {loading && !plan ? <div className={`${CARD} flex items-center gap-3`}><Loader2 className="animate-spin text-blue-600" size={20} /> Carregando seu plano...</div> : plan ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={CARD}><p className="text-sm text-slate-500 dark:text-slate-400">Semana atual</p><p className="mt-2 text-3xl font-bold">{plan.weekly_completed}<span className="text-lg text-slate-400">/{plan.weekly_planned}</span></p><div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${plan.weekly_planned ? (plan.weekly_completed / plan.weekly_planned) * 100 : 0}%` }} /></div></div>
              <div className={CARD}><p className="text-sm text-slate-500 dark:text-slate-400">Questões na semana</p><p className="mt-2 text-3xl font-bold">{plan.weekly_answers}</p><p className="mt-1 text-xs text-slate-500">{plan.weekly_correct} acertos</p></div>
              <div className={CARD}><p className="text-sm text-slate-500 dark:text-slate-400">Revisões pendentes</p><p className="mt-2 text-3xl font-bold">{alerts.reviews_due}</p><Link href={`/questions?progress=review`} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400">Revisar agora <ArrowRight size={14} /></Link></div>
              <div className={CARD}><p className="text-sm text-slate-500 dark:text-slate-400">Foco de hoje (pomodoro)</p><p className="mt-2 text-3xl font-bold">{focusTotal} <span className="text-lg text-slate-400">min</span></p><p className="mt-1 text-xs text-slate-500">{intervals.filter((item) => item.kind === "break").length} pausas hoje</p></div>
            </section>

            {plan.kind === "cronograma" && (
              <section className={CARD}>
                <div className="flex items-center gap-2"><CalendarDays size={19} className="text-blue-600" /><h2 className="text-lg font-bold">Seu cronograma</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">distribuição por dia</span></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                  {DAYS.map((day, weekday) => {
                    const entry = plan.schedule?.find((item) => item.weekday === weekday);
                    const isToday = (new Date().getDay() + 6) % 7 === weekday;
                    const isActive = plan.weekdays.includes(weekday) && Boolean(entry?.disciplines.length);
                    return <div key={day} className={`rounded-xl border p-3 ${isToday ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30" : isActive ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950" : "border-slate-200 opacity-45 dark:border-slate-800"}`}>
                      <h3 className="text-sm font-bold">{day}</h3>
                      {isActive ? entry!.disciplines.map((discipline) => <span key={discipline} className="mt-2 block rounded-lg bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">{discipline} · {Math.round(entry!.minutes / entry!.disciplines.length)}m</span>) : <p className="mt-2 text-xs text-slate-400">Sem estudo</p>}
                    </div>;
                  })}
                </div>
              </section>
            )}

            {plan.kind === "ciclo" && (
              <section className={`${CARD} grid gap-6 md:grid-cols-[auto_1fr]`}>
                <div className="flex items-center gap-5">
                  <Ring progress={cycleProgress}><div className="text-center"><p className="text-3xl font-bold">{plan.cycle_index}<span className="text-lg text-slate-400">/{plan.cycle.length}</span></p><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">do ciclo</p></div></Ring>
                  <div className="hidden md:block"><h2 className="text-lg font-bold">Status do ciclo</h2><p className="mt-1 max-w-52 text-sm text-slate-500 dark:text-slate-400">A fila gira uma etapa por dia de estudo na ordem que você definiu.</p></div>
                </div>
                <div><h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fila do ciclo</h3><ol className="mt-3 space-y-1.5">{plan.cycle.map((item, index) => { const past = index < (plan.cycle_index ?? 0); return <li key={index} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${index === (plan.cycle_index ?? 0) ? "border-blue-400 bg-blue-50 font-semibold dark:border-blue-600 dark:bg-blue-950/30" : "border-slate-100 dark:border-slate-800"} ${past ? "text-slate-400 line-through" : ""}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold dark:bg-slate-800">{index + 1}</span><span className="flex-1 truncate">{index === (plan.cycle_index ?? 0) && <span className="mr-2 text-blue-600">→</span>}{item.discipline}</span><span className="shrink-0 text-xs text-slate-500">{KIND[item.kind]} · {item.minutes}m</span></li>; })}</ol></div>
              </section>
            )}

            <section className={`${CARD} grid gap-6 lg:grid-cols-[1fr_360px]`}>
              <div>
                <div className="flex items-center gap-2"><Timer size={19} className="text-blue-600" /><h2 className="text-lg font-bold">Pomodoro do plano</h2></div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Foque na disciplina do dia, faça uma pausa e registre seus intervalos. Ao fim de cada etapa soa um alerta.</p>
                <div className="mt-5 grid place-items-center">
                  <div className="relative grid h-48 w-48 place-items-center rounded-full border-4 border-blue-600/80 bg-slate-50 shadow-inner dark:bg-slate-950">
                    <div><p className="text-center text-5xl font-bold tabular-nums">{phase === "idle" ? formatTime(focusMinutes * 60) : formatTime(secondsLeft)}</p><p className="mt-1 text-center text-xs font-bold uppercase tracking-widest text-slate-500">{phase === "break" ? "pausa" : phase === "focus" ? "foco" : "pronto"}</p></div>
                  </div>
                  <div className="mt-4 h-2 w-56 rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${timerProgress * 100}%` }} /></div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={toggleRunning} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? "Pausar" : phase === "idle" ? "Iniciar" : "Continuar"}</button>
                  <button type="button" disabled={phase === "idle"} onClick={() => { if (intervalRef.current) clearInterval(intervalRef.current); setPhase("idle"); setRunning(false); setSecondsLeft(0); }} className={`${BUTTON} border border-slate-300 disabled:opacity-40 dark:border-slate-700`}><RotateCcw size={15} /> Reiniciar</button>
                  {phase === "focus" && <button type="button" onClick={() => startTimer("break")} className={`${BUTTON} border border-slate-300 dark:border-slate-700`}><Coffee size={16} /> Pausa agora</button>}
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><span>Foco (min)</span><select value={focusMinutes} onChange={(event) => { setFocusMinutes(Number(event.target.value)); if (phase === "idle") setSecondsLeft(Number(event.target.value) * 60); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">{[15, 20, 25, 30, 40, 45, 50, 60].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><span>Pausa (min)</span><select value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">{[1, 3, 5, 8, 10, 15].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                </div>
              </div>
              <aside className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="text-sm font-bold">Intervalos de hoje</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{focusTotal} min de foco registrados</p>
                <ol className="mt-4 space-y-2">{intervals.length ? intervals.map((item) => <li key={item.id} className="flex items-center gap-3 text-sm"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${item.kind === "focus" ? "bg-blue-600/10 text-blue-600 dark:text-blue-400" : "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400"}`}>{item.kind === "focus" ? <Timer size={14} /> : <Coffee size={14} />}</span><span className="flex-1 capitalize">{item.kind}</span><span className="font-semibold">{item.minutes} min</span><span className="text-xs text-slate-500">{new Date(item.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></li>) : <li className="text-sm text-slate-500 dark:text-slate-400">Nenhum intervalo registrado hoje. Conclua um pomodoro para começar a acompanhar.</li>}</ol>
              </aside>
            </section>

            <section className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2"><CalendarDays size={19} className="text-blue-600" /><h2 className="text-lg font-bold">Minha semana {week === 0 ? "(atual)" : ""}</h2></div>
                <div className="flex gap-2">
                  <button type="button" disabled={week === 0} onClick={() => setWeek(week - 1)} aria-label="Semana anterior" className={`${BUTTON} border border-slate-300 disabled:opacity-40 dark:border-slate-700`}><ChevronLeft size={17} /></button>
                  <button type="button" disabled={week === 12} onClick={() => setWeek(week + 1)} aria-label="Próxima semana" className={`${BUTTON} border border-slate-300 disabled:opacity-40 dark:border-slate-700`}><ChevronRight size={17} /></button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-7">{days.map((day) => <div key={day} className={`min-h-40 rounded-xl border p-3 ${day === today ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"}`}><h3 className="text-sm font-bold capitalize">{dayLabel(day)}</h3><div className="mt-3 space-y-2">{(blocks[day] || []).map((item) => <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-1"><span className="font-semibold">{KIND[item.kind]}</span>{item.status === "done" && <Check size={14} className="text-emerald-600" />}</div><p className="mt-1 break-words text-slate-600 dark:text-slate-300">{item.discipline}</p><p className="mt-1 text-slate-500">{item.planned_minutes} min{item.actual_minutes ? ` · ${item.actual_minutes} feitos` : ""}{item.answered_questions ? ` · ${item.answered_questions} questões` : ""}</p>{item.status === "pending" && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => { setActiveBlock(item); setActualMinutes(String(item.planned_minutes)); }} className="font-semibold text-blue-600 dark:text-blue-400">Concluir</button><button type="button" onClick={() => void updateBlockStatus(item, "skipped")} className="text-slate-500">Adiar</button></div>}{item.status === "skipped" && <button type="button" onClick={() => void updateBlockStatus(item, "pending")} className="mt-2 font-semibold text-blue-600">Retomar</button>}<label className="mt-2 block text-slate-500">Mover para <input type="date" min={today} value={item.date} onChange={(event) => void moveBlock(item, event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" /></label></div>)}{!(blocks[day] || []).length && <p className="text-xs text-slate-400">Dia livre</p>}</div></div>)}</div>
            </section>

            {week === 0 && pendingToday.length > 0 && (
              <section className={CARD}>
                <div className="flex items-center gap-2"><Clock3 size={19} className="text-blue-600" /><h2 className="text-lg font-bold">O que estudar hoje</h2></div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">{pendingToday.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{KIND[item.kind]} · {item.planned_minutes} min</p><h3 className="mt-1 font-semibold">{item.discipline}</h3>{item.kind !== "theory" ? <Link href={`/questions?discipline=${encodeURIComponent(item.discipline)}${item.kind === "review" ? "&progress=review" : ""}`} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400">Começar <ArrowRight size={15} /></Link> : <button type="button" onClick={() => { setActiveBlock(item); setActualMinutes(String(item.planned_minutes)); }} className="mt-3 text-sm font-bold text-blue-600 dark:text-blue-400">Registrar estudo</button>}</div>)}</div>
              </section>
            )}

            <section className={CARD}>
              <div className="flex items-center gap-2"><BookOpen size={18} className="text-blue-600" /><h2 className="text-lg font-bold">Disciplinas nesta semana</h2></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{plan.discipline_stats.map((item) => <Link key={item.discipline} href={`/questions?discipline=${encodeURIComponent(item.discipline)}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-400 dark:border-slate-700"><h3 className="font-bold">{item.discipline}</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.completed}/{item.total} atividades · {item.actual_minutes}/{item.planned_minutes} min</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.answered} questões · {item.correct} acertos</p></Link>)}</div>
            </section>

            <p className="flex items-center gap-2 px-1 text-xs text-slate-400 dark:text-slate-500"><Target size={14} /> Ajuste qualquer atividade: conclua registrando o tempo, adie marcando como &quot;Adiar&quot; ou mova para outra data.</p>
          </>
        ) : null}
      </div>

      {activeBlock && <div role="dialog" aria-modal="true" aria-label="Registrar estudo" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"><div className={`${CARD} w-full max-w-sm`}><h2 className="text-lg font-bold">Registrar {KIND[activeBlock.kind].toLowerCase()} de {activeBlock.discipline}</h2><p className="mt-1 text-sm text-slate-500">Quanto tempo você estudou de fato?</p><label htmlFor="actual-minutes" className="mt-4 block text-sm font-semibold">Minutos estudados</label><input id="actual-minutes" type="number" min={1} max={480} value={actualMinutes} onChange={(event) => setActualMinutes(event.target.value)} className="min-h-11 mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /><div className="mt-5 flex gap-2"><button type="button" disabled={saving} onClick={() => void completeBlock()} className={`${BUTTON} bg-blue-600 text-white disabled:opacity-50`}>{saving ? "Salvando..." : "Concluir atividade"}</button><button type="button" onClick={() => setActiveBlock(null)} className={`${BUTTON} border border-slate-300 dark:border-slate-700`}>Cancelar</button></div></div></div>}
    </main>
  );
}