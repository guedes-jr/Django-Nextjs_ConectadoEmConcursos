"use client";

import { useEffect, useState } from "react";
import { auditAdmin, AuditEventRow } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { AuditChanges } from "@/components/admin/AuditChanges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emptyFilters = {action:"",resource_type:"",resource_id:"",q:"",actor:"",since:"",until:""};
export default function AuditPage() {
  const [filters,setFilters] = useState(emptyFilters);
  const [applied,setApplied] = useState(emptyFilters);
  const [rows,setRows] = useState<AuditEventRow[]>([]);
  const [total,setTotal] = useState(0);
  const [limit,setLimit] = useState(30);
  const [page,setPage] = useState(1);
  const [selected,setSelected] = useState<AuditEventRow|null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [refresh,setRefresh] = useState(0);

  useEffect(()=>{
    let active=true;
    setError("");setLoading(true);
    auditAdmin.list({...applied,page}).then(result=>{
      if(active){setRows(result.results);setTotal(result.total);setLimit(result.limit);}
    }).catch(()=>{if(active)setError("Não foi possível consultar a auditoria. O acesso exige superusuário.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[applied,page,refresh]);

  const apply = (event:React.FormEvent)=>{
    event.preventDefault();
    const since=filters.since ? new Date(filters.since) : null;
    const until=filters.until ? new Date(filters.until) : null;
    if ((since && Number.isNaN(since.getTime())) || (until && Number.isNaN(until.getTime())) || (since && until && since>=until)) {
      setError("Informe um período válido, com término posterior ao início.");return;
    }
    setApplied({...filters,since:since?.toISOString() || "",until:until?.toISOString() || ""});setPage(1);setSelected(null);
  };

  return <div className="space-y-6">
    <PageHeader title="Auditoria" description="Histórico administrativo com ator, origem e comparação de campos. Dados sensíveis são redigidos."/>
    <form onSubmit={apply} className="grid gap-3 rounded-xl border p-4 md:grid-cols-3">
      <Input aria-label="Buscar ação, recurso ou motivo" placeholder="Buscar ação, recurso ou motivo" value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})}/>
      <Input aria-label="Ação exata" placeholder="Ação exata" value={filters.action} onChange={e=>setFilters({...filters,action:e.target.value})}/>
      <Input aria-label="Tipo de recurso" placeholder="Tipo de recurso" value={filters.resource_type} onChange={e=>setFilters({...filters,resource_type:e.target.value})}/>
      <Input aria-label="Identificador do recurso" placeholder="Identificador do recurso" value={filters.resource_id} onChange={e=>setFilters({...filters,resource_id:e.target.value})}/>
      <Input aria-label="ID do ator" placeholder="ID do ator" inputMode="numeric" value={filters.actor} onChange={e=>setFilters({...filters,actor:e.target.value})}/>
      <label className="text-sm">A partir de (horário local)<Input type="datetime-local" value={filters.since} onChange={e=>setFilters({...filters,since:e.target.value})}/></label>
      <label className="text-sm">Até (horário local)<Input type="datetime-local" value={filters.until} onChange={e=>setFilters({...filters,until:e.target.value})}/></label>
      <div className="flex flex-wrap gap-2 md:col-span-3"><Button type="submit" disabled={loading}>Aplicar filtros</Button><Button type="button" variant="outline" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Atualizar</Button><a className="rounded-md border px-3 py-2 text-sm font-medium" href={auditAdmin.exportUrl(applied)}>Exportar CSV</a></div>
    </form>
    {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <p className="text-sm text-slate-500">{total} evento(s) encontrado(s)</p>
    {loading ? <p role="status">Carregando auditoria…</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Data</th><th>Ação</th><th>Recurso</th><th>Ator / origem</th><th className="p-3">Detalhe</th></tr></thead><tbody>
      {rows.map(row=><tr key={row.id} className="border-b"><td className="whitespace-nowrap p-3">{new Date(row.created_at).toLocaleString("pt-BR")}</td><td>{row.action}</td><td>{row.resource_type} {row.resource_id && `#${row.resource_id}`}</td><td>{row.actor?.username || "Sistema"}<p className="text-xs text-slate-500">{String(row.context?.origin || "Origem não registrada")}</p></td><td className="p-3"><button className="underline" onClick={()=>setSelected(row)}>Ver alterações #{row.id}</button></td></tr>)}
      {!rows.length && <tr><td colSpan={5} className="p-5 text-slate-500">Nenhum evento encontrado.</td></tr>}
    </tbody></table></div>}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={loading || page===1} onClick={()=>setPage(page-1)}>Anterior</Button><span className="text-sm">Página {page} de {Math.max(1,Math.ceil(total/limit))}</span><Button variant="outline" disabled={loading || page*limit>=total} onClick={()=>setPage(page+1)}>Próxima</Button></div>
    {selected && <section className="rounded-xl border p-4" aria-label="Detalhe do evento">
      <div className="flex justify-between gap-4"><h2 className="font-semibold">Evento #{selected.id} · {selected.action}</h2><button className="underline" onClick={()=>setSelected(null)}>Fechar detalhe</button></div>
      {selected.reason && <p className="mt-2"><strong>Motivo:</strong> {selected.reason}</p>}
      <p className="mt-2 break-words text-sm">Origem: {String(selected.context?.origin || "não registrada")} · Correlação: {selected.request_id || String(selected.context?.operation_id || "não registrada")}</p>
      <AuditChanges changes={selected.changes || []}/>
      <details className="mt-4"><summary className="cursor-pointer text-sm">Snapshots e contexto redigidos</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100">Antes{`\n${JSON.stringify(selected.before,null,2)}`}</pre><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100">Depois{`\n${JSON.stringify(selected.after,null,2)}`}</pre><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100 md:col-span-2">Contexto{`\n${JSON.stringify(selected.context,null,2)}`}</pre></div></details>
    </section>}
  </div>;
}
