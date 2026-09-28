"use client";

import { useCallback, useEffect, useState } from "react";
import { diagnostics } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";

const tabs = ["Visão geral", "Serviços", "Banco de dados", "Logs", "Scripts"] as const;
type Tab = typeof tabs[number];
const bytes = (value?: number) => value ? `${Math.round(value / 1024 / 1024)} MB` : "Indisponível";

function diagnosticError(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { detail?: string } } })?.response;
  const detail = response?.data?.detail;
  if (response?.status === 401) return "Sua sessão expirou. Entre novamente para acessar o diagnóstico.";
  if (response?.status === 403) return "Seu usuário não possui permissão para acessar o diagnóstico.";
  if (response?.status === 404) return detail || "Esta ferramenta está desativada ou o backend ainda não foi atualizado. Confirme DIAGNOSTICS_ENABLED=1 e faça o deploy do backend.";
  return detail || "Não foi possível carregar esta aba de diagnóstico. Consulte os logs do backend para mais detalhes.";
}

export default function Diagnostics() {
  const [tab, setTab] = useState<Tab>("Visão geral"), [data, setData] = useState<any>(), [loadedTab, setLoadedTab] = useState<Tab | null>(null), [error, setError] = useState(""), [logs, setLogs] = useState<any>(), [selectedLog, setSelectedLog] = useState(""), [scriptResult, setScriptResult] = useState<any>(), [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setData(undefined);
    try {
      const loader = tab === "Visão geral" ? diagnostics.overview : tab === "Serviços" ? diagnostics.services : tab === "Banco de dados" ? diagnostics.database : tab === "Logs" ? diagnostics.logs : diagnostics.scripts;
      const response = await loader();
      setData(response);
      setLoadedTab(tab);
      if (tab === "Logs") { setLogs(response); setSelectedLog(""); }
    } catch (requestError) { setError(diagnosticError(requestError)); }
    finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);
  const openLog = async (service: string) => { setSelectedLog(service); try { setLogs(await diagnostics.logs({ service, lines: 100 })); } catch { setError("Não foi possível abrir esse log."); } };
  const runScript = async (script: string) => { setError(""); try { setScriptResult(await diagnostics.runScript(script)); } catch { setError("O script não pôde ser executado."); } };
  return <div className="space-y-6"><PageHeader title="Diagnóstico" description="Área técnica somente leitura. Não há shell, terminal ou execução arbitrária de código." /><div className="flex flex-wrap gap-2 border-b">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === item ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500"}`}>{item}</button>)}</div><div className="flex items-center gap-3"><Button variant="outline" disabled={loading} onClick={() => void load()}>{loading ? "Atualizando…" : "Atualizar"}</Button><p className="text-xs text-slate-500">Coleta manual; nenhuma ação de infraestrutura é disparada.</p></div>{error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{tab === "Visão geral" && loadedTab === tab && data && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><section className="rounded-xl border p-4"><h2 className="font-semibold">Aplicação</h2><p>Python: {data.application.python}</p><p>Ambiente: {data.application.environment}</p><p>Horário: {new Date(data.application.time).toLocaleString("pt-BR")}</p></section><section className="rounded-xl border p-4"><h2 className="font-semibold">Armazenamento</h2><p>Livre: {bytes(data.storage.free)}</p><p>Usado: {bytes(data.storage.used)}</p></section><section className="rounded-xl border p-4"><h2 className="font-semibold">Capacidade</h2><p>CPU: {data.capacity.cpu_percent ?? "indisponível"}%</p><p>Memória usada: {bytes(data.capacity.memory_used)}</p></section></div>}{tab === "Serviços" && loadedTab === tab && data && <div className="grid gap-4 md:grid-cols-2">{Object.entries(data).filter(([key]) => key !== "host").map(([key, service]: any) => <section key={key} className="rounded-xl border p-4"><h2 className="capitalize font-semibold">{key}</h2><p className="mt-2 text-sm">Status: <strong>{service.status}</strong></p><p className="text-sm text-slate-500">{service.detail}</p></section>)}<section className="rounded-xl border p-4"><h2 className="font-semibold">Host</h2><p className="text-sm">PID: {data.host.pid}</p><p className="text-sm">Carga: {data.host.load_average?.join(" · ") || "indisponível"}</p></section></div>}{tab === "Banco de dados" && loadedTab === tab && data && <section className="max-w-2xl rounded-xl border p-5"><h2 className="font-semibold">Banco de dados</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(data).filter(([, value]) => typeof value !== "object").map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{key.replaceAll("_", " ")}</dt><dd className="font-medium">{String(value ?? "indisponível")}</dd></div>)}</dl><p className="mt-4 text-sm text-slate-500">{data.slow_queries?.detail}</p></section>}{tab === "Logs" && loadedTab === tab && data && <div className="space-y-4"><p className="text-sm text-slate-500">{data.detail || "Selecione um log permitido."}</p><div className="flex flex-wrap gap-2">{data.results?.map((item: any) => <Button key={item.id} variant="outline" disabled={!item.available} onClick={() => void openLog(item.id)}>{item.id}</Button>)}</div>{selectedLog && logs?.lines && <pre className="max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{logs.lines.join("\n") || "Nenhuma linha encontrada."}</pre>}</div>}{tab === "Scripts" && loadedTab === tab && data && <div className="space-y-4"><p className="text-sm text-slate-500">Apenas scripts revisados, somente leitura e sem argumentos são permitidos.</p>{data.results.map((script: any) => <section key={script.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h2 className="font-semibold">{script.title}</h2><p className="text-sm text-slate-500">{script.description}</p></div><Button variant="outline" onClick={() => void runScript(script.id)}>Executar</Button></section>)}{scriptResult && <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(scriptResult, null, 2)}</pre>}</div>}</div>;
}
