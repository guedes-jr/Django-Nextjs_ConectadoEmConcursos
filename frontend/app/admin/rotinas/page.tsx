"use client";

import { Activity, CalendarClock, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { FormEvent, useEffect, useState } from "react";
import { routines, Schedule, ScheduleInput, RoutineSettings, RoutineExecution, ExecutionList } from "@/lib/routines";
import { adminError } from "@/components/admin/useAdminListing";
import PlatformDiagnostics from "@/components/admin/PlatformDiagnostics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const empty: ScheduleInput = { routine: "publish_notifications", name: "", enabled: true, frequency: "daily", interval_minutes: 60, time_of_day: "03:15", timezone_name: "America/Fortaleza" };
const input = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border bg-transparent px-3 text-sm";
const button = "routine-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";
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
  const [removing, setRemoving] = useState<Schedule | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [technicalOpen, setTechnicalOpen] = useState(false);
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
  async function remove() {
    if (!removing || busy) return;
    setBusy(true); setRemoveError("");
    try { const result = await routines.remove(removing.id); setRemoving(null); setNotice(result.detail); reload(); }
    catch (err) { setRemoveError(adminError(err, "Não foi possível remover a rotina.")); }
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
    <PageHeader title="Rotinas e monitoramento" description="Configure os agendamentos e acompanhe a operação da plataforma." actions={<>
      <button className={button} disabled={loading || busy} onClick={reload}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Atualizar</button>
      {tab === "schedules" && settings && <button className={`${button} routine-primary`} disabled={busy} onClick={() => edit()}><Plus size={16}/>Adicionar rotina</button>}
    </>}/>
    <div role="tablist" aria-label="Gestão de rotinas" className="max-w-full flex-wrap">
      <button id="routines-tab" role="tab" aria-controls="routines-panel" aria-selected={tab === "schedules"} data-state={tab === "schedules" ? "active" : "inactive"} onClick={() => setTab("schedules")}>Rotinas</button>
      <button id="diagnostics-tab" role="tab" aria-controls="diagnostics-panel" aria-selected={tab === "diagnostics"} data-state={tab === "diagnostics" ? "active" : "inactive"} onClick={() => setTab("diagnostics")}>Diagnósticos e logs</button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">{notice}</p>}

    {loading && <p role="status">Carregando rotinas...</p>}
    {settings && tab === "schedules" && <section id="routines-panel" role="tabpanel" aria-labelledby="routines-tab" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">{settings.catalog.map(item => <div key={item.id} className="min-w-0 rounded-xl border p-4 text-sm">
        <div className="flex items-start gap-3"><Activity size={18} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400"/><div>
          <p className="font-semibold">{item.title}</p>
          <p className={`mt-2 flex items-center gap-2 text-xs font-medium ${item.executor_active ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"/>{item.executor_active ? "Executor com sinal recente" : "Sem sinal recente do executor"}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Última verificação: {date(item.last_tick_at)} (Fortaleza)</p>
        </div></div>
      </div>)}</div>
      <div className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-700">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock size={18} className="text-blue-600 dark:text-blue-400"/>Agendamentos</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{settings.results.length} rotina(s) · {settings.results.filter(item => item.enabled).length} ativa(s)</span>
        </div>
        <div className="relative overflow-x-auto" role="region" aria-label="Tabela de agendamentos" tabIndex={0}>
          <table className="min-w-[850px]" aria-label="Agendamentos de rotinas">
            <thead><tr><th scope="col">Rotina</th><th scope="col">Status</th><th scope="col">Frequência</th><th scope="col">Próxima execução</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{settings.results.map(schedule => <tr key={schedule.id}>
              <td className="max-w-72"><h3 className="break-words font-semibold text-slate-900 dark:text-slate-100">{schedule.name}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{settings.catalog.find(item => item.id === schedule.routine)?.title}</p></td>
              <td><StatusBadge status={schedule.enabled ? "active" : "paused"}/></td>
              <td className="whitespace-nowrap">{schedule.frequency === "daily" ? `Todos os dias às ${schedule.time_of_day}` : `A cada ${schedule.interval_minutes} minuto(s)`}</td>
              <td className="whitespace-nowrap"><p>{schedule.enabled ? date(schedule.next_run_at, schedule.timezone_name) : "Agendamento pausado"}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{schedule.timezone_name}</p></td>
              <td><div className="flex justify-end gap-2"><button className={button} disabled={busy} onClick={() => edit(schedule)} aria-label={`Editar ${schedule.name}`}>Editar</button><button className={`${button} routine-danger`} disabled={busy} onClick={() => { setRemoving(schedule); setRemoveError(""); }} aria-label={`Remover ${schedule.name}`}>Remover</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {settings.results.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum agendamento configurado.</p>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Remover retira o agendamento da lista e preserva seu histórico. Pausar impede novas execuções; uma rotina que já começou continua até terminar. O executor do servidor precisa estar instalado e ativo. A atualização desta tela é manual.</p>
    </section>}
    {history && tab === "diagnostics" && <section id="diagnostics-panel" role="tabpanel" aria-labelledby="diagnostics-tab" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(Object.keys(labels) as Array<keyof typeof labels>).map(key => <div key={key} className="rounded-lg border p-3"><p className="text-xs text-slate-500 dark:text-slate-400">{labels[key]}</p><p className="mt-1 text-xl font-bold">{history.summary[key]}</p></div>)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm">Rotina<select className={input} value={query.routine} onChange={e => change("routine", e.target.value)}><option value="">Todas as rotinas</option>{settings?.catalog.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="min-w-0 text-sm">Status da execução<select className={input} value={query.status} onChange={e => change("status", e.target.value)}><option value="">Todos os status</option>{Object.entries(labels).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label></div>
      {!history.can_view_logs && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">A consulta dos logs exige diagnóstico técnico habilitado e concessão explícita da permissão de diagnóstico ao superadministrador.</p>}
      <p className="text-xs text-slate-500 dark:text-slate-400">Histórico do executor gerenciado, a partir da implantação desta funcionalidade. Horários abaixo em America/Fortaleza.</p>
      <div className="overflow-hidden rounded-xl border">
        <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700"><h2 className="font-semibold">Histórico de execuções</h2></div>
        <div className="relative overflow-x-auto" role="region" aria-label="Tabela do histórico de execuções" tabIndex={0}>
          <table className="min-w-[800px]" aria-label="Histórico de execuções">
            <thead><tr><th scope="col">Rotina</th><th scope="col">Resultado</th><th scope="col">Início / fim</th><th scope="col">Duração</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{history.results.map(execution => <tr key={execution.id}>
              <td className="max-w-72"><h3 className="break-words font-semibold text-slate-900 dark:text-slate-100">{execution.schedule_name}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Execução #{execution.id}</p></td>
              <td><StatusBadge status={execution.status}/></td>
              <td className="whitespace-nowrap"><p>{date(execution.started_at)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Fim: {date(execution.finished_at)}</p></td>
              <td className="whitespace-nowrap">{execution.duration_ms === null ? "Em execução" : `${(execution.duration_ms / 1000).toFixed(2)} s`}</td>
              <td><div className="flex justify-end"><button className={button} disabled={busy || !history.can_view_logs} onClick={() => void showLog(execution)} aria-label={`Consultar log da execução ${execution.id}`}>Consultar log</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!loading && !history.results.length && <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma execução encontrada para os filtros.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={loading || query.page === 1} onClick={() => { setLoading(true); setQuery(current => ({ ...current, page: current.page - 1 })); }}>Anterior</button><span className="text-sm">Página {query.page} · {history.count} execução(ões)</span><button className={button} disabled={loading || query.page * 20 >= history.count} onClick={() => { setLoading(true); setQuery(current => ({ ...current, page: current.page + 1 })); }}>Próxima</button></div>
      {history.can_view_logs && <details className="min-w-0 rounded-xl border p-4" onToggle={event => setTechnicalOpen(event.currentTarget.open)}><summary className="cursor-pointer font-semibold">Diagnóstico técnico da plataforma e logs dos serviços</summary>{technicalOpen && <div className="mt-5 min-w-0"><PlatformDiagnostics/></div>}</details>}
    </section>}
    <Dialog open={removing !== null} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}><DialogContent><DialogHeader><DialogTitle>Remover rotina</DialogTitle><DialogDescription>Remover o agendamento “{removing?.name}”? Ele deixará de ser executado nos próximos horários. O histórico será preservado e uma execução já iniciada poderá terminar.</DialogDescription></DialogHeader>{removeError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{removeError}</p>}<div className="flex flex-wrap justify-end gap-3"><button type="button" className={button} disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button><button type="button" className={`${button} routine-destructive`} disabled={busy} onClick={() => void remove()}>Confirmar remoção</button></div></DialogContent></Dialog>
    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? "Editar rotina" : "Adicionar rotina"}</DialogTitle><DialogDescription>Escolha uma rotina e seu horário. Salvar não executa a rotina imediatamente.</DialogDescription></DialogHeader>{formError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{formError}</p>}{editing && <form onSubmit={save} className="min-w-0 space-y-4"><label className="block text-sm">Nome do agendamento<input required maxLength={120} className={input} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/></label><label className="block text-sm">Rotina do agendamento<select disabled={!!editingId} className={input} value={editing.routine} onChange={e => setEditing({ ...editing, routine: e.target.value })}>{settings?.catalog.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="block text-sm">Frequência<select className={input} value={editing.frequency} onChange={e => setEditing({ ...editing, frequency: e.target.value as ScheduleInput["frequency"] })}><option value="daily">Diariamente</option><option value="interval">A cada intervalo</option></select></label>{editing.frequency === "daily" ? <label className="block text-sm">Horário<input required type="time" className={input} value={editing.time_of_day} onChange={e => setEditing({ ...editing, time_of_day: e.target.value })}/></label> : <label className="block text-sm">Intervalo em minutos<input required type="number" min={1} max={43200} className={input} value={editing.interval_minutes} onChange={e => setEditing({ ...editing, interval_minutes: Number(e.target.value) })}/></label>}<label className="block text-sm">Fuso horário<select className={input} value={editing.timezone_name} onChange={e => setEditing({ ...editing, timezone_name: e.target.value })}>{settings?.timezones.map(zone => <option key={zone}>{zone}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })}/>Agendamento ativo</label><button disabled={busy} className={`${button} routine-primary`}>Salvar agendamento</button></form>}</DialogContent></Dialog>
    <Dialog open={detail !== null} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Log da execução #{detail?.id}</DialogTitle><DialogDescription>{detail?.schedule_name} · {detail ? labels[detail.status] : ""}</DialogDescription></DialogHeader>{detail?.log_truncated && <p className="text-sm text-amber-700 dark:text-amber-300">Log limitado a 64 KiB. Consulte o journal do serviço para investigar saídas maiores.</p>}<pre className="max-h-[60vh] min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{detail?.log || "Nenhuma saída registrada. O resultado da execução está indicado no status."}</pre></DialogContent></Dialog>
  </div>;
}
