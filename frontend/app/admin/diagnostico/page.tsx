"use client";

import { useEffect, useState } from "react";
import { diagnostics, DiagnosticOverview, DiagnosticServices, DiagnosticDatabase, DiagnosticLogFile, DiagnosticLogPage, DiagnosticLogQuery, DiagnosticRoutine, DiagnosticRoutineResult } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const tabs = ["Visão geral","Serviços","Banco de dados","Logs","Rotinas"] as const;
type Tab = typeof tabs[number];
const services = {django:"Django",worker:"Worker",scheduler:"Agendador",frontend:"Frontend",proxy:"Proxy"} as const;
const statuses:Record<string,string> = {ok:"Disponível",degraded:"Degradado",down:"Indisponível",not_configured:"Coleta não configurada",unavailable:"Coleta indisponível",stale:"Coleta desatualizada"};
const initialFilters = {q:"",severity:"",request_id:"",since:"",until:""};
const bytes = (value:number|null|undefined)=>value == null ? "Indisponível" : value>=1073741824 ? `${(value/1073741824).toFixed(1)} GB` : value>=1048576 ? `${(value/1048576).toFixed(1)} MB` : `${value.toLocaleString("pt-BR")} bytes`;
const date = (value?:string|null)=>value ? new Date(value).toLocaleString("pt-BR") : "Indisponível";
const selectClass = "h-10 rounded-md border bg-white px-3 text-sm dark:bg-slate-900";

function diagnosticError(error:unknown) {
  const response = (error as {response?:{status?:number;data?:Record<string,unknown>}})?.response;
  if(response?.status === 404) return "Ferramenta indisponível. O acesso exige superusuário, permissão explícita e diagnóstico habilitado no servidor.";
  if(response?.status === 429) return "Limite de consultas atingido. Aguarde um minuto antes de tentar novamente.";
  if(response?.data && !(response.data instanceof Blob)) return Object.values(response.data).flat().join(" · ");
  return "Não foi possível concluir a consulta de diagnóstico.";
}

export default function Diagnostics() {
  const [tab,setTab] = useState<Tab>("Visão geral");
  const [overview,setOverview] = useState<DiagnosticOverview|null>(null);
  const [serviceData,setServiceData] = useState<DiagnosticServices|null>(null);
  const [database,setDatabase] = useState<DiagnosticDatabase|null>(null);
  const [files,setFiles] = useState<DiagnosticLogFile[]>([]);
  const [routines,setRoutines] = useState<DiagnosticRoutine[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [selectedLog,setSelectedLog] = useState("");
  const [logFilters,setLogFilters] = useState(initialFilters);
  const [logQuery,setLogQuery] = useState<DiagnosticLogQuery>({page:1});
  const [logs,setLogs] = useState<DiagnosticLogPage|null>(null);
  const [logsLoading,setLogsLoading] = useState(false);
  const [downloading,setDownloading] = useState(false);
  const [running,setRunning] = useState("");
  const [scriptResult,setScriptResult] = useState<DiagnosticRoutineResult|null>(null);

  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");
    if(tab === "Visão geral") setOverview(null);
    if(tab === "Serviços") setServiceData(null);
    if(tab === "Banco de dados") setDatabase(null);
    if(tab === "Logs") setFiles([]);
    if(tab === "Rotinas") setRoutines([]);
    async function load() {
      try {
        switch(tab) {
          case "Visão geral": {const result=await diagnostics.overview();if(active)setOverview(result);break;}
          case "Serviços": {const result=await diagnostics.services();if(active)setServiceData(result);break;}
          case "Banco de dados": {const result=await diagnostics.database();if(active)setDatabase(result);break;}
          case "Logs": {const result=await diagnostics.logFiles();if(active)setFiles(result.results);break;}
          case "Rotinas": {const result=await diagnostics.scripts();if(active)setRoutines(result.results);break;}
        }
      } catch(cause){if(active)setError(diagnosticError(cause));}
      finally{if(active)setLoading(false);}
    }
    void load();
    return ()=>{active=false;};
  },[tab,refresh]);

  useEffect(()=>{
    if(tab !== "Logs" || !selectedLog) return;
    let active=true;
    setError("");setLogsLoading(true);
    diagnostics.logs({...logQuery,service:selectedLog}).then(result=>{if(active)setLogs(result);})
      .catch(cause=>{if(active){setLogs(null);setError(diagnosticError(cause));}}).finally(()=>{if(active)setLogsLoading(false);});
    return ()=>{active=false;};
  },[selectedLog,logQuery,tab]);

  const applyLogs = (event:React.FormEvent)=>{
    event.preventDefault();
    const since=logFilters.since ? new Date(logFilters.since) : null;
    const until=logFilters.until ? new Date(logFilters.until) : null;
    if((since && Number.isNaN(since.getTime())) || (until && Number.isNaN(until.getTime())) || (since && until && since>=until)) {setError("Informe um período válido.");return;}
    setLogQuery({...logFilters,since:since?.toISOString(),until:until?.toISOString(),page:1,snapshot:""});
  };
  const download = async()=>{
    if(!logs || downloading) return;
    setDownloading(true);setError("");
    try {
      const blob=await diagnostics.downloadLogs({...logQuery,service:selectedLog,snapshot:logs.snapshot,page:1});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");anchor.href=url;anchor.download="diagnostic-log.txt";anchor.click();
      URL.revokeObjectURL(url);
    } catch(cause){setError(diagnosticError(cause));}
    finally{setDownloading(false);}
  };
  const run = async(id:string)=>{
    if(running) return;
    setRunning(id);setScriptResult(null);setError("");
    try{setScriptResult(await diagnostics.runScript(id));}
    catch(cause){setError(diagnosticError(cause));}
    finally{setRunning("");}
  };
  const update = ()=>{
    setRefresh(value=>value+1);
    if(tab === "Logs") setLogQuery(current=>({...current,page:1,snapshot:""}));
  };

  return <div className="space-y-6">
    <PageHeader title="Diagnóstico" description="Saúde da aplicação, logs permitidos e rotinas internas de leitura."/>
    <div role="tablist" aria-label="Áreas do diagnóstico" className="flex gap-2 overflow-x-auto border-b">{tabs.map(item=><button key={item} role="tab" aria-selected={tab===item} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab===item ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500"}`} onClick={()=>setTab(item)}>{item}</button>)}</div>
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={loading || logsLoading} onClick={update}>Atualizar{tab === "Logs" ? " janela" : ""}</Button><p className="text-xs text-slate-500">Atualização manual · dados coletados no servidor.</p></div>
    {error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading && <p role="status">Coletando diagnóstico…</p>}
    {!loading && tab === "Visão geral" && overview && <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-xl border p-4"><h2 className="font-semibold">Aplicação</h2><p>Versão: {overview.application.version || "Não informada"}</p><p>Python: {overview.application.python}</p><p>Ambiente: {overview.application.environment}</p><p>Coleta: {date(overview.application.time)}</p></section>
        <section className="rounded-xl border p-4"><h2 className="font-semibold">Armazenamento</h2><p>Livre: {bytes(overview.storage.free)}</p><p>Usado: {bytes(overview.storage.used)}</p>{overview.storage.free/overview.storage.total<0.1 && <p className="text-amber-700">Espaço livre abaixo de 10%.</p>}</section>
        <section className="rounded-xl border p-4"><h2 className="font-semibold">Capacidade</h2><p>CPU: {overview.capacity.cpu_percent == null ? "Indisponível" : `${overview.capacity.cpu_percent}%`}</p><p>Memória do host usada: {bytes(overview.capacity.memory_used)}</p><p>Pico de memória do processo: {bytes(overview.capacity.process_memory_peak)}</p>{overview.capacity.cpu_percent != null && overview.capacity.cpu_percent>=90 && <p className="text-amber-700">CPU acima de 90%.</p>}{overview.capacity.memory_total != null && overview.capacity.memory_used != null && overview.capacity.memory_used/overview.capacity.memory_total>=0.9 && <p className="text-amber-700">Memória do host acima de 90%.</p>}</section>
        <section className="rounded-xl border p-4"><h2 className="font-semibold">Banco</h2><p>{overview.database.connected ? "Conectado" : "Conexão indisponível"}</p><p>Latência: {overview.database.latency_ms} ms</p><p>Migrações pendentes: {overview.database.pending_migrations ?? "Indisponível"}</p>{overview.database.detail && <p className="text-sm text-amber-700">{overview.database.detail}</p>}</section>
        <section className="rounded-xl border p-4"><h2 className="font-semibold">Limites de diagnóstico</h2><p>Consultas: {overview.limits.query_timeout_ms} ms</p><p>Janela de logs: {bytes(overview.limits.log_max_bytes)}</p><p>Resultado das rotinas: {bytes(overview.limits.result_max_bytes)}</p></section>
      </div>
    </>}
    {!loading && tab === "Serviços" && serviceData && <div className="grid gap-4 md:grid-cols-2">
      {Object.entries(services).map(([key,label])=>{const service=serviceData[key as keyof typeof services];return <section key={key} className="rounded-xl border p-4"><h2 className="font-semibold">{label}</h2><p>Status: <strong>{statuses[service.status] || service.status}</strong></p><p className="text-sm text-slate-500">{service.detail}</p>{service.checked_at && <p className="text-sm">Coleta: {date(service.checked_at)}</p>}{service.latency_ms != null && <p className="text-sm">Latência: {service.latency_ms} ms</p>}{service.started_at && <p className="text-sm">Início: {date(service.started_at)}</p>}{service.failures_recent != null && <p className="text-sm">Falhas recentes: {service.failures_recent}</p>}</section>;})}
      <section className="rounded-xl border p-4"><h2 className="font-semibold">Host</h2><p>PID: {serviceData.host.pid}</p><p>Carga: {serviceData.host.load_average?.join(" · ") || "Indisponível"}</p></section>
    </div>}
    {!loading && tab === "Banco de dados" && database && <section className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Banco de dados</h2>
      <dl className="grid gap-4 sm:grid-cols-2"><div><dt>Conexão</dt><dd>{database.connected ? "Disponível" : "Indisponível"}</dd></div><div><dt>Motor / versão</dt><dd>{database.vendor} · {database.version || "Indisponível"}</dd></div><div><dt>Tamanho lógico</dt><dd>{bytes(database.size)}</dd></div><div><dt>Conexões ativas</dt><dd>{database.active_connections ?? "Indisponível"}</dd></div><div><dt>Latência</dt><dd>{database.latency_ms} ms</dd></div><div><dt>Migrações pendentes</dt><dd>{database.pending_migrations ?? "Indisponível"}</dd></div></dl>
      {database.detail && <p className="text-sm text-amber-700">{database.detail}</p>}<p className="text-sm text-slate-500">{database.slow_queries.detail}</p>
      {database.slow_queries.available && <p className="text-sm">Chamadas: {database.slow_queries.calls} · Maior média: {database.slow_queries.slowest_mean_ms?.toFixed(2)} ms · Tempo agregado: {database.slow_queries.total_exec_ms?.toFixed(2)} ms</p>}
    </section>}
    {!loading && tab === "Logs" && <section className="space-y-4">
      <label className="block text-sm">Arquivo permitido<select className={`${selectClass} ml-3`} value={selectedLog} onChange={event=>{setSelectedLog(event.target.value);setLogs(null);setLogQuery({page:1});setLogFilters(initialFilters);}}><option value="">Selecione um log</option>{files.map(file=><option key={file.id} value={file.id} disabled={!file.available}>{file.name} ({file.id.slice(0,6)}){!file.available ? " — indisponível" : ""}</option>)}</select></label>
      {!files.length && <p className="text-sm">Nenhum arquivo de log foi configurado no servidor.</p>}
      {selectedLog && <form onSubmit={applyLogs} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input aria-label="Buscar texto nos logs" placeholder="Texto" value={logFilters.q} onChange={e=>setLogFilters({...logFilters,q:e.target.value})}/>
        <select aria-label="Severidade" className={selectClass} value={logFilters.severity} onChange={e=>setLogFilters({...logFilters,severity:e.target.value})}><option value="">Todas as severidades</option>{["DEBUG","INFO","WARNING","ERROR","CRITICAL"].map(level=><option key={level}>{level}</option>)}</select>
        <Input aria-label="Correlação da requisição" placeholder="ID da requisição" value={logFilters.request_id} onChange={e=>setLogFilters({...logFilters,request_id:e.target.value})}/>
        <label className="text-sm">A partir de<Input type="datetime-local" value={logFilters.since} onChange={e=>setLogFilters({...logFilters,since:e.target.value})}/></label><label className="text-sm">Até<Input type="datetime-local" value={logFilters.until} onChange={e=>setLogFilters({...logFilters,until:e.target.value})}/></label>
        <div className="flex items-end gap-2"><Button type="submit" disabled={logsLoading}>Aplicar filtros</Button><Button type="button" variant="outline" disabled={!logs || downloading || logsLoading} onClick={()=>void download()}>{downloading ? "Baixando…" : "Baixar TXT limitado"}</Button></div>
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">Linhas mais recentes primeiro. Filtros de período incluem apenas linhas com data reconhecida. O download respeita os filtros e os limites do servidor.</p>
      </form>}
      {logsLoading && <p role="status">Lendo janela de logs…</p>}
      {!logsLoading && logs && <>
        <p className="text-sm">{logs.total} linha(s) nesta janela · {bytes(logs.bytes_read)} lidos.{logs.window_limited && " O histórico anterior ao limite de bytes/linhas não foi consultado."}</p>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{logs.lines.join("\n") || "Nenhuma linha encontrada."}</pre>
        <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={logs.page<=1} onClick={()=>setLogQuery(current=>({...current,page:logs.page-1,snapshot:logs.snapshot}))}>Anterior</Button><span className="text-sm">Página {logs.page} de {Math.max(1,Math.ceil(logs.total/logs.limit))}</span><Button variant="outline" disabled={logs.page*logs.limit>=logs.total} onClick={()=>setLogQuery(current=>({...current,page:logs.page+1,snapshot:logs.snapshot}))}>Próxima</Button></div>
      </>}
    </section>}
    {!loading && tab === "Rotinas" && <section className="space-y-4"><p className="text-sm text-slate-500">Consultas internas revisadas, executadas com orçamento no banco e limite de saída. A execução e o resultado redigido ficam na auditoria.</p>
      {routines.map(routine=><section key={routine.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h2 className="font-semibold">{routine.title}</h2><p className="text-sm text-slate-500">{routine.description}</p></div><Button variant="outline" disabled={Boolean(running)} onClick={()=>void run(routine.id)}>{running===routine.id ? "Executando…" : "Executar"}</Button></section>)}
      {scriptResult && <div className="space-y-2"><p className="break-all text-xs">{scriptResult.elapsed_ms} ms · Hash: {scriptResult.script_hash}</p>{scriptResult.truncated && <p className="text-sm text-amber-700">A saída excedeu o limite. O resultado foi limitado.</p>}<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(scriptResult.result,null,2)}</pre></div>}
    </section>}
  </div>;
}
