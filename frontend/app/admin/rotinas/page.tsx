"use client";

import { FormEvent, useEffect, useState } from "react";
import { routines, Schedule, ScheduleInput, RoutineSettings, RoutineExecution, ExecutionList } from "@/lib/routines";
import { adminError } from "@/components/admin/useAdminListing";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const empty: ScheduleInput = { routine: "publish_notifications", name: "", enabled: true, frequency: "daily", interval_minutes: 60, time_of_day: "03:15", timezone_name: "America/Fortaleza" };
const input = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border bg-transparent px-3 text-sm";
const button = "min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50";
const labels = { running: "Em execução", success: "Sucesso", error: "Erro", interrupted: "Interrompida" };
const date = (value: string | null, zone = "America/Fortaleza") => value ? new Date(value).toLocaleString("pt-BR", { timeZone: zone }) : "—";

export default function RoutinesPage() {
  const [tab, setTab] = useState<"schedules" | "diagnostics">("schedules");
  const [settings, setSettings] = useState<RoutineSettings | null>(null);
  const [history, setHistory] = useState<ExecutionList | null>(null);
  const [query, setQuery] = useState({ routine: "", status: "", page: 1 });
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ScheduleInput | null>(null);
  const [editingId, setEditingId] = useState<number>();
  const [formError, setFormError] = useState("");
  const [detail, setDetail] = useState<RoutineExecution | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([routines.settings(), routines.executions(query)])
      .then(([config, rows]) => { if (active) { setSettings(config); setHistory(rows); setError(""); } })
      .catch(err => { if (active) setError(adminError(err, "Não foi possível carregar as rotinas.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, refresh]);

  function reload() { setLoading(true); setRefresh(value => value + 1); }
  function edit(schedule?: Schedule) {
    setEditingId(schedule?.id); setFormError("");
    setEditing(schedule ? { routine: schedule.routine, name: schedule.name, enabled: schedule.enabled, frequency: schedule.frequency, interval_minutes: schedule.interval_minutes, time_of_day: schedule.time_of_day, timezone_name: schedule.timezone_name } : { ...empty });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return;
    setBusy(true); setFormError("");
    try { await routines.save(editing, editingId); setEditing(null); setNotice("Agendamento salvo. O executor usará o novo horário na próxima verificação."); reload(); }
    catch (err) { setFormError(adminError(err, "Não foi possível salvar o agendamento.")); }
    finally { setBusy(false); }
  }
  async function showLog(execution: RoutineExecution) {
    setBusy(true); setError("");
    try { setDetail(await routines.execution(execution.id)); }
    catch (err) { setError(adminError(err, "Não foi possível consultar o log.")); }
    finally { setBusy(false); }
  }
  const change = (key: "routine" | "status", value: string) => { setLoading(true); setQuery(current => ({ ...current, [key]: value, page: 1 })); };

  return <div className="min-w-0 space-y-6">
    <header><h1 className="text-2xl font-bold">Rotinas e agendamentos</h1><p className="mt-2 text-sm text-slate-500">Configure horários e acompanhe as execuções operacionais. Os horários usam o fuso de cada agendamento.</p></header>
    <div role="tablist" aria-label="Gestão de rotinas" className="flex gap-2 border-b"><button role="tab" aria-selected={tab === "schedules"} className={button} onClick={() => setTab("schedules")}>Agendamentos</button><button role="tab" aria-selected={tab === "diagnostics"} className={button} onClick={() => setTab("diagnostics")}>Diagnósticos</button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <div className="flex flex-wrap gap-3"><button className={button} disabled={loading || busy} onClick={reload}>Atualizar</button>{tab === "schedules" && settings && <button className={`${button} bg-blue-600 text-white`} disabled={busy} onClick={() => edit()}>Adicionar agendamento</button>}</div>
    {loading && <p role="status">Carregando rotinas...</p>}
    {settings && tab === "schedules" && <section aria-label="Agendamentos configurados" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">{settings.catalog.map(item => <div key={item.id} className="min-w-0 rounded-lg border p-4 text-sm"><p className="font-semibold">{item.title}</p><p className={item.executor_active ? "mt-2 text-emerald-700" : "mt-2 text-amber-700"}>{item.executor_active ? "Executor com sinal recente" : "Sem sinal recente do executor"}</p><p className="mt-1 text-xs text-slate-500">Última verificação: {date(item.last_tick_at)} (Fortaleza)</p></div>)}</div>
      {settings.results.map(schedule => <article key={schedule.id} className="min-w-0 rounded-xl border bg-white p-4 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{schedule.name}</h2><p className="mt-1 text-sm text-slate-500">{settings.catalog.find(item => item.id === schedule.routine)?.title}</p><p className="mt-2 text-sm">{schedule.enabled ? "Ativo" : "Pausado"} · {schedule.frequency === "daily" ? `Todos os dias às ${schedule.time_of_day}` : `A cada ${schedule.interval_minutes} minuto(s)`} · {schedule.timezone_name}</p><p className="mt-1 text-xs text-slate-500">Próxima execução: {schedule.enabled ? date(schedule.next_run_at, schedule.timezone_name) : "Agendamento pausado"}</p></div><button className={button} disabled={busy} onClick={() => edit(schedule)} aria-label={`Editar ${schedule.name}`}>Editar</button></div></article>)}
      {settings.results.length === 0 && <p>Nenhum agendamento configurado.</p>}
      <p className="text-xs text-slate-500">Pausar impede novas execuções; uma rotina que já começou continua até terminar. O executor do servidor precisa estar instalado e ativo. A atualização desta tela é manual.</p>
    </section>}
    {history && tab === "diagnostics" && <section aria-label="Diagnósticos de rotinas" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(Object.keys(labels) as Array<keyof typeof labels>).map(key => <div key={key} className="rounded-lg border p-3"><p className="text-xs text-slate-500">{labels[key]}</p><p className="mt-1 text-xl font-bold">{history.summary[key]}</p></div>)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm">Rotina<select className={input} value={query.routine} onChange={e => change("routine", e.target.value)}><option value="">Todas as rotinas</option>{settings?.catalog.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="min-w-0 text-sm">Status da execução<select className={input} value={query.status} onChange={e => change("status", e.target.value)}><option value="">Todos os status</option>{Object.entries(labels).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label></div>
      {!history.can_view_logs && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A consulta dos logs exige diagnóstico técnico habilitado e concessão explícita da permissão de diagnóstico ao superadministrador.</p>}
      <p className="text-xs text-slate-500">Histórico do executor gerenciado, a partir da implantação desta funcionalidade. Horários abaixo em America/Fortaleza.</p>
      {history.results.map(execution => <article key={execution.id} className="min-w-0 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{execution.schedule_name}</h2><p className={`mt-1 text-sm ${["error", "interrupted"].includes(execution.status) ? "text-red-700" : execution.status === "success" ? "text-emerald-700" : "text-blue-700"}`}>{labels[execution.status]} · {date(execution.started_at)}</p><p className="mt-1 text-xs text-slate-500">Duração: {execution.duration_ms === null ? "Em execução" : `${(execution.duration_ms / 1000).toFixed(2)} s`} · Fim: {date(execution.finished_at)}</p></div><button className={button} disabled={busy || !history.can_view_logs} onClick={() => void showLog(execution)} aria-label={`Consultar log da execução ${execution.id}`}>Consultar log</button></div></article>)}
      {!loading && !history.results.length && <p>Nenhuma execução encontrada para os filtros.</p>}
      <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={loading || query.page === 1} onClick={() => { setLoading(true); setQuery(current => ({ ...current, page: current.page - 1 })); }}>Anterior</button><span className="text-sm">Página {query.page} · {history.count} execução(ões)</span><button className={button} disabled={loading || query.page * 20 >= history.count} onClick={() => { setLoading(true); setQuery(current => ({ ...current, page: current.page + 1 })); }}>Próxima</button></div>
    </section>}
    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? "Editar agendamento" : "Adicionar agendamento"}</DialogTitle><DialogDescription>Escolha uma rotina e seu horário. Salvar não executa a rotina imediatamente.</DialogDescription></DialogHeader>{formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}{editing && <form onSubmit={save} className="min-w-0 space-y-4"><label className="block text-sm">Nome do agendamento<input required maxLength={120} className={input} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/></label><label className="block text-sm">Rotina do agendamento<select disabled={!!editingId} className={input} value={editing.routine} onChange={e => setEditing({ ...editing, routine: e.target.value })}>{settings?.catalog.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="block text-sm">Frequência<select className={input} value={editing.frequency} onChange={e => setEditing({ ...editing, frequency: e.target.value as ScheduleInput["frequency"] })}><option value="daily">Diariamente</option><option value="interval">A cada intervalo</option></select></label>{editing.frequency === "daily" ? <label className="block text-sm">Horário<input required type="time" className={input} value={editing.time_of_day} onChange={e => setEditing({ ...editing, time_of_day: e.target.value })}/></label> : <label className="block text-sm">Intervalo em minutos<input required type="number" min={1} max={43200} className={input} value={editing.interval_minutes} onChange={e => setEditing({ ...editing, interval_minutes: Number(e.target.value) })}/></label>}<label className="block text-sm">Fuso horário<select className={input} value={editing.timezone_name} onChange={e => setEditing({ ...editing, timezone_name: e.target.value })}>{settings?.timezones.map(zone => <option key={zone}>{zone}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })}/>Agendamento ativo</label><button disabled={busy} className={`${button} bg-blue-600 text-white`}>Salvar agendamento</button></form>}</DialogContent></Dialog>
    <Dialog open={detail !== null} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Log da execução #{detail?.id}</DialogTitle><DialogDescription>{detail?.schedule_name} · {detail ? labels[detail.status] : ""}</DialogDescription></DialogHeader>{detail?.log_truncated && <p className="text-sm text-amber-700">Log limitado a 64 KiB. Consulte o journal do serviço para investigar saídas maiores.</p>}<pre className="max-h-[60vh] min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{detail?.log || "Nenhuma saída registrada. O resultado da execução está indicado no status."}</pre></DialogContent></Dialog>
  </div>;
}
