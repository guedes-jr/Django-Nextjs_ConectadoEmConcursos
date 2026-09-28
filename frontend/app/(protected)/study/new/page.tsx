"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowDown, ArrowUp, CalendarRange, Check, ListOrdered, Plus, Save, Search, Trash2, Waypoints, X } from "lucide-react";
import { listQuestionDisciplines } from "@/lib/questions";
import { createStudyPlan, updateStudyPlan, getStudyPlan, KIND_LABELS, WEEKDAY_LABELS, WEEKDAY_SHORT, type PlanInput, type PlanKind, type StudyBlockKind } from "@/lib/studies";

const KIND_ICONS = { trilha: Waypoints, cronograma: CalendarRange, ciclo: ListOrdered };
const DAYS = WEEKDAY_SHORT;
const GOALS = ["Técnico Judiciário", "Analista Judiciário", "Policial Civil", "Policial Federal", "Auditor Fiscal", "Professor", "Área Administrativa", "Outro objetivo"];
const DEFAULT_DISCIPLINES = [
  "Administração Geral", "Administração Pública", "Arquivologia", "Atualidades", "Contabilidade Geral", "Contabilidade Pública", "Direito Administrativo", "Direito Ambiental", "Direito Civil", "Direito Constitucional", "Direito do Trabalho", "Direito Empresarial", "Direito Internacional", "Direito Penal", "Direito Previdenciário", "Direito Processual Civil", "Direito Processual Penal", "Direito Tributário", "Economia", "Estatística", "Ética no Serviço Público", "Finanças Públicas", "Geografia", "Gestão de Pessoas", "História", "Informática", "Legislação Especial", "Língua Inglesa", "Língua Portuguesa", "Matemática", "Matemática Financeira", "Pedagogia", "Português", "Raciocínio Lógico", "Redação", "Tecnologia da Informação",
];
const CYCLE_KINDS: { value: StudyBlockKind; label: string }[] = [
  { value: "theory", label: "Teoria" },
  { value: "questions", label: "Questões" },
  { value: "review", label: "Revisão" },
];
const I = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const BUTTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition";

function errorText(error: unknown) {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (data) return Object.values(data).flat().join(" ");
  return "Não foi possível salvar. Tente novamente.";
}

type Row = { discipline: string; kind: StudyBlockKind; minutes: number };
type DayRow = { disciplines: string[]; minutes: number };

export default function NewStudyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const rawKind = (params.get("kind") || "trilha") as PlanKind;
  const editId = params.get("id") ? Number(params.get("id")) : null;
  const kind: PlanKind = ["trilha", "cronograma", "ciclo"].includes(rawKind) ? rawKind : "trilha";
  const Icon = KIND_ICONS[kind];

  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [disciplineSearch, setDisciplineSearch] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [schedule, setSchedule] = useState<DayRow[]>([]);
  const [cycle, setCycle] = useState<Row[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("19:00");

  useEffect(() => {
    void listQuestionDisciplines()
      .then((items) => setDisciplines([...new Set([...DEFAULT_DISCIPLINES, ...items])].sort((a, b) => a.localeCompare(b, "pt-BR"))))
      .catch(() => setDisciplines(DEFAULT_DISCIPLINES))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    void getStudyPlan(editId).then((plan) => {
      setGoal(plan.goal);
      setTitle(plan.title || "");
      setExamDate(plan.exam_date);
      setSelected(plan.disciplines);
      setWeekdays(plan.weekdays);
      setMinutes(plan.minutes_per_day);
      setReminderEnabled(plan.reminder_enabled);
      setReminderTime(plan.reminder_time || "19:00");
      if (plan.kind === "cronograma" && plan.schedule?.length) {
        setSchedule(DAYS.map((_, weekday) => {
          const item = plan.schedule.find((entry) => entry.weekday === weekday);
          return item ? { disciplines: item.disciplines, minutes: item.minutes } : { disciplines: [], minutes: plan.minutes_per_day };
        }));
      }
      if (plan.kind === "ciclo" && plan.cycle?.length) setCycle(plan.cycle.map((item) => ({ discipline: item.discipline, kind: item.kind, minutes: item.minutes })));
    }).catch((error) => setMessage(errorText(error))).finally(() => setLoading(false));
  }, [editId]);

  const autoSchedule = useCallback(() => {
    const perDay = Math.floor(minutes / Math.max(1, selected.length));
    setSchedule(DAYS.map((_, weekday) => ({ disciplines: weekdays.includes(weekday) ? [...selected] : [], minutes: weekdays.includes(weekday) ? perDay * Math.max(1, selected.length) : 0 })));
  }, [minutes, selected, weekdays]);

  useEffect(() => {
    if (kind === "cronograma" && !editId && schedule.length === 0 && selected.length) autoSchedule();
  }, [kind, editId, schedule.length, selected.length, autoSchedule, minutes]);

  function toggleWeekday(weekday: number) {
    setWeekdays((currentWeekdays) => currentWeekdays.includes(weekday)
      ? currentWeekdays.filter((item) => item !== weekday)
      : [...currentWeekdays, weekday].sort((a, b) => a - b));
  }

  function addDiscipline(discipline: string) {
    setSelected((values) => values.includes(discipline) ? values : [...values, discipline]);
    setDisciplineSearch("");
  }

  function removeDiscipline(discipline: string) {
    setSelected((values) => values.filter((item) => item !== discipline));
  }

  const normalizedDisciplineSearch = disciplineSearch.trim().toLocaleLowerCase("pt-BR");
  const matchingDisciplines = disciplines.filter((discipline) => !selected.includes(discipline) && (!normalizedDisciplineSearch || discipline.toLocaleLowerCase("pt-BR").includes(normalizedDisciplineSearch)));

  function defaultMinutes(dayDisciplines: string[]) {
    return Math.round(minutes / Math.max(1, dayDisciplines.length));
  }

  function toggleDayDiscipline(weekday: number, discipline: string) {
    setSchedule((items) => items.map((item, index) => {
      if (index !== weekday) return item;
      const active = item.disciplines.includes(discipline);
      const disciplines = active ? item.disciplines.filter((value) => value !== discipline) : [...item.disciplines, discipline];
      return { disciplines, minutes: active ? item.minutes : item.minutes + defaultMinutes(disciplines) };
    }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!selected.length) { setMessage("Escolha pelo menos uma disciplina."); return; }
    if (!weekdays.length) { setMessage("Escolha pelo menos um dia da semana."); return; }
    if (kind === "cronograma") {
      const distribution = schedule.filter((_, weekday) => weekdays.includes(weekday) && _.disciplines.length > 0);
      if (!distribution.length) { setMessage("Distribua pelo menos uma disciplina em algum dia do cronograma."); return; }
    }
    if (kind === "ciclo" && !cycle.length) { setMessage("Monte a fila do ciclo com pelo menos uma disciplina."); return; }
    setSaving(true);
    const input: PlanInput = {
      kind,
      title: title.trim() || undefined,
      goal,
      exam_date: examDate,
      disciplines: selected,
      weekdays,
      minutes_per_day: minutes,
      reminder_enabled: reminderEnabled,
      reminder_time: reminderEnabled ? reminderTime : null,
    };
    if (kind === "cronograma") {
      input.schedule = schedule
        .map((row, weekday) => ({ ...row, weekday }))
        .filter((row) => weekdays.includes(row.weekday) && row.disciplines.length > 0);
    }
    if (kind === "ciclo") input.cycle = cycle.filter((row) => row.discipline && row.minutes > 0).map((row) => ({ discipline: row.discipline, minutes: row.minutes, kind: row.kind }));
    (async () => {
      try {
        const saved = editId ? await updateStudyPlan(editId, input) : await createStudyPlan(input);
        router.push(`/study/plan/${saved.id}`);
      } catch (error) {
        setMessage(errorText(error));
        setSaving(false);
      }
    })();
  }

  if (loading) return <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 p-6 dark:bg-slate-950"><div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">Carregando...</div></main>;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center gap-3">
          <Link href="/study" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 transition hover:border-blue-400 dark:border-slate-700" aria-label="Voltar para a área de estudos"><ArrowLeft size={18} /></Link>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400"><Icon size={20} /></span>
          <div><p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{editId ? "Ajustar plano" : "Novo plano"}</p><h1 className="text-2xl font-bold tracking-tight">{KIND_LABELS[kind]}</h1></div>
        </header>

        {message && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">{message}</div>}

        <form onSubmit={submit} className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold">Sobre o plano</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="title" className="mb-2 block text-sm font-semibold">Nome do plano <span className="font-normal text-slate-500">(opcional)</span></label><input id="title" value={title} onChange={(event) => setTitle(event.target.value)} className={I} placeholder={`Ex.: Preparação ${KIND_LABELS[kind]}`} maxLength={60} /></div>
              <div><label htmlFor="goal" className="mb-2 block text-sm font-semibold">Objetivo ou carreira</label><input id="goal" list="study-goals" value={goal} onChange={(event) => setGoal(event.target.value)} className={I} placeholder="Ex.: Técnico Judiciário" maxLength={160} required /><datalist id="study-goals">{GOALS.map((item) => <option key={item} value={item} />)}</datalist></div>
            </div>
            <div><label htmlFor="exam-date" className="mb-2 block text-sm font-semibold">Data da prova <span className="font-normal text-slate-500">(opcional)</span></label><input id="exam-date" type="date" min={new Date().toISOString().slice(0, 10)} value={examDate || ""} onChange={(event) => setExamDate(event.target.value || null)} className={`${I} max-w-60`} /></div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold">Disciplinas e disponibilidade</h2>
            <div>
              <label htmlFor="discipline-search" className="mb-2 block text-sm font-semibold">Disciplinas</label>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                {selected.length > 0 && <div className="mb-3 flex flex-wrap gap-2" aria-label="Disciplinas selecionadas">{selected.map((discipline) => <span key={discipline} className="inline-flex items-center gap-1 rounded-lg bg-blue-100 py-1 pl-2 pr-1 text-sm font-semibold text-blue-800 dark:bg-blue-950/70 dark:text-blue-200">{discipline}<button type="button" onClick={() => removeDiscipline(discipline)} className="rounded-md p-0.5 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900" aria-label={`Remover ${discipline}`}><X size={14} /></button></span>)}</div>}
                <div className="relative"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="discipline-search" value={disciplineSearch} onChange={(event) => setDisciplineSearch(event.target.value)} className={`${I} pl-10`} placeholder="Pesquise uma disciplina para adicionar" autoComplete="off" /></div>
                {disciplineSearch.trim() && <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-1 dark:border-slate-700">{matchingDisciplines.map((discipline) => <button key={discipline} type="button" onClick={() => addDiscipline(discipline)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none dark:hover:bg-slate-700 dark:focus:bg-slate-700"><span>{discipline}</span><Plus size={16} className="text-blue-600" /></button>)}{matchingDisciplines.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Nenhuma disciplina disponível com esse nome.</p>}</div>}
                {!disciplines.length && <p className="mt-2 text-sm text-slate-500">Nenhuma disciplina disponível na base de questões.</p>}
                {!disciplineSearch.trim() && <p className="mt-2 text-xs text-slate-500">Pesquise pelo nome e adicione as disciplinas que farão parte do plano.</p>}
              </div>
            </div>
            <fieldset>
              <legend className="mb-2 block text-sm font-semibold">Dias da semana disponíveis</legend>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Dias disponíveis para estudo">
                {DAYS.map((day, weekday) => {
                  const selectedDay = weekdays.includes(weekday);
                  return (
                    <label key={day} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-blue-400 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-900 ${selectedDay ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-100" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
                      <input
                        type="checkbox"
                        checked={selectedDay}
                        onChange={() => toggleWeekday(weekday)}
                        className="h-4 w-4 shrink-0 rounded border-slate-400 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                      />
                      <span>{day}</span>
                      {selectedDay && <span className="ml-auto text-xs font-medium text-blue-600 dark:text-blue-300">Selecionado</span>}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">Marque todos os dias em que você pretende estudar.</p>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="minutes" className="mb-2 block text-sm font-semibold">Minutos por dia de estudo</label><input id="minutes" type="number" min={25} max={480} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className={`${I} max-w-44`} /></div>{kind === "ciclo" && <p className="self-end text-xs text-slate-500 dark:text-slate-400">O ciclo gira uma etapa por dia; etapas da fila que ultrapassarem o tempo total ainda entram no dia.</p>}</div>
          </section>

          {kind === "cronograma" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-bold">Distribuição semanal</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Monte o cronograma: marque as disciplinas e ajuste os minutos de cada dia.</p></div>
                <button type="button" onClick={autoSchedule} className={`${BUTTON} border border-slate-300 dark:border-slate-700`}><Check size={16} /> Distribuir automaticamente</button>
              </div>
              <div className="space-y-3">
                {DAYS.map((day, weekday) => weekdays.includes(weekday) && (
                  <div key={day} className={`rounded-xl border p-4 ${schedule[weekday]?.disciplines.length ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">{WEEKDAY_LABELS[weekday]}</p><label className="flex items-center gap-2 text-xs text-slate-500"><span>Minutos</span><input type="number" min={0} max={480} value={schedule[weekday]?.minutes ?? 0} onChange={(event) => setSchedule((items) => items.map((row, index) => index === weekday ? { ...row, minutes: Number(event.target.value) } : row))} className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800" /></label></div>
                    <div className="mt-3 flex flex-wrap gap-2">{selected.map((discipline) => { const isActive = schedule[weekday]?.disciplines.includes(discipline) ?? false; return <button key={discipline} type="button" onClick={() => toggleDayDiscipline(weekday, discipline)} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${isActive ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:text-slate-300"}`}>{discipline}</button>; })}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">{schedule[weekday]?.disciplines.map((discipline) => <span key={discipline} className="rounded-lg bg-blue-100 px-2 py-1 font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">{discipline}</span>)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {kind === "ciclo" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <div><h2 className="text-lg font-bold">Fila do ciclo</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A ordem define a sequência que se repete. Cada etapa ocupa um dia de estudo.</p></div>
              {cycle.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">A fila está vazia. Adicione uma etapa abaixo.</p>}
              <div className="space-y-2">{cycle.map((row, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-600/10 text-xs font-bold text-blue-600 dark:text-blue-400">{index + 1}</span>
                  <select value={row.discipline} onChange={(event) => setCycle((rows) => rows.map((item, i) => i === index ? { ...item, discipline: event.target.value } : item))} className={`${I} min-h-10 flex-1`}>{!selected.includes(row.discipline) && <option value={row.discipline}>{row.discipline}</option>}{selected.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}</select>
                  <select value={row.kind} onChange={(event) => setCycle((rows) => rows.map((item, i) => i === index ? { ...item, kind: event.target.value as StudyBlockKind } : item))} className={`${I} min-h-10 w-32`}>{CYCLE_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                  <input type="number" min={25} max={600} value={row.minutes} onChange={(event) => setCycle((rows) => rows.map((item, i) => i === index ? { ...item, minutes: Number(event.target.value) } : item))} className={`${I} min-h-10 w-24`} aria-label="Minutos da etapa" />
                  <div className="flex gap-1"><button type="button" disabled={index === 0} onClick={() => setCycle((rows) => { const copy = [...rows]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy; })} className={`${BUTTON} min-h-9 border border-slate-300 p-2 disabled:opacity-30 dark:border-slate-700`} aria-label="Subir etapa"><ArrowUp size={15} /></button><button type="button" disabled={index === cycle.length - 1} onClick={() => setCycle((rows) => { const copy = [...rows]; [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]]; return copy; })} className={`${BUTTON} min-h-9 border border-slate-300 p-2 disabled:opacity-30 dark:border-slate-700`} aria-label="Descer etapa"><ArrowDown size={15} /></button><button type="button" onClick={() => setCycle((rows) => rows.filter((_, i) => i !== index))} className={`${BUTTON} min-h-9 border border-red-200 p-2 text-red-600 dark:border-red-900`} aria-label="Remover etapa"><Trash2 size={15} /></button></div>
                </div>
              ))}</div>
              <button type="button" disabled={!selected.length} onClick={() => setCycle((rows) => [...rows, { discipline: selected[0], kind: "theory", minutes: 60 }])} className={`${BUTTON} border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 dark:border-slate-700`}><Plus size={16} /> Adicionar etapa</button>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />Lembrar-me de estudar o plano</label>
            {reminderEnabled && <div className="mt-3"><label htmlFor="reminder-time" className="mb-2 block text-sm text-slate-500 dark:text-slate-400">Horário do lembrete</label><input id="reminder-time" type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} className={`${I} max-w-40`} /></div>}
          </section>

          <div className="flex flex-wrap items-center gap-3 pb-4">
            <button type="submit" disabled={saving} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>{saving ? "Salvando..." : <><Save size={17} /> {editId ? "Salvar alterações" : "Criar plano"}<ArrowRight size={17} /></>}</button>
            <Link href="/study" className={`${BUTTON} border border-slate-300 dark:border-slate-700`}>Cancelar</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
