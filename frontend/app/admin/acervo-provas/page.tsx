"use client";

import { useEffect, useState } from "react";
import { Archive, ExternalLink, Link2, Plus, FileText, CheckCircle, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, EmptyState, LoadingState } from "@/components/admin/Notice";
import { CatalogSummary, type CatalogMetric } from "@/components/admin/CatalogSummary";
import { FilterBar, AdminFilterSelect, ListToolbar, ListPagination } from "@/components/admin/ListControls";
import { useAdminListing, adminError, type AdminListResult } from "@/components/admin/useAdminListing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { http } from "@/lib/http";

type Portal = { is_active?: boolean; slug: string; name: string; catalog_url: string; documents_count: number };
type Download = { status: string; bytes: number; sha256: string; error: string; final_url?: string };
type Doc = { id: number; portal: string; portal_name: string; title: string; year: number | null; kind: string; status: string; organization: string; role: string; source_url: string; paired_with: number | null; workflow_status: string; download?: Download | null };
type Detail = Doc & { events: Array<{ id: number; status: string; http_status: number | null; bytes: number; sha256: string; final_url: string; error: string; created_at: string; finished_at: string | null }> };

const BASE = "/api/backoffice/content/official-exams";
const labels: Record<string, string> = { exam: "Prova", answer_key_preliminary: "Gabarito preliminar", answer_key_final: "Gabarito final", discovered: "Descoberto", review: "Aguardando conferência", downloaded: "Baixado", failed: "Falhou", answer_key_pending: "Gabarito pendente", ready_manual: "Pronto para preparação manual", paired: "Pareado" };

const defaults = {search:"",portal:"",kind:"",status:"",year:"",organization:"",role:"",category:"",pending:"",ordering:"recent",page:"1",page_size:"12"};
const fetchDocuments = (params:Record<string,string>) => http.get<AdminListResult<Doc>>(`${BASE}/documents/`,{params}).then(r=>r.data);
const metrics: CatalogMetric[] = [
 {key:"total",title:"Documentos",hint:"Total cadastrado",icon:<Archive/>},
 {key:"proofs",title:"Provas",hint:"Documentos de prova",icon:<FileText/>,filter:["kind","exam"]},
 {key:"keys",title:"Gabaritos",hint:"Preliminares e finais",icon:<CheckCircle/>,filter:["category","keys"]},
 {key:"downloaded",title:"Baixados",hint:"Documentos com PDF baixado",icon:<CheckCircle/>,accent:"emerald",filter:["status","downloaded"]},
 {key:"pending",title:"Sem gabarito",hint:"Provas sem associação",icon:<AlertTriangle/>,accent:"amber",filter:["pending","1"]},
];

export default function AcervoProvas() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const {query:filters,data,loading,error,reload:load,change,clear,hasFilters} = useAdminListing(defaults,fetchDocuments);
  const docs = data?.results ?? [];
  const canManage = data?.can_manage ?? false;
  const [formOpen,setFormOpen] = useState(false);
  const [portalsOpen,setPortalsOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [compatibleDocs,setCompatibleDocs] = useState<Doc[]>([]);
  const [pairSearch,setPairSearch] = useState("");
  const [pairPage,setPairPage] = useState(1);
  const [pairCount,setPairCount] = useState(0);
  const [pairLoading,setPairLoading] = useState(false);
  const [form, setForm] = useState({ portal: "", title: "", year: "", organization: "", role: "", kind: "exam", source_url: "" });
  const [pairingId, setPairingId] = useState<number | null>(null);
  const [selectedPairId, setSelectedPairId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [preview, setPreview] = useState<{ slug: string; candidates: Array<{ title: string; source_url: string; year: number | null; kind: string; already_registered: boolean }> } | null>(null);
  const [msg, setMsg] = useState<string>();
  const [success,setSuccess] = useState<string>();
  const execute = async (action:()=>Promise<void>) => { if(busy)return;setBusy(true);setMsg(undefined);setSuccess(undefined);try{await action();}finally{setBusy(false);} };

  useEffect(() => {
    void http.get<{results:Portal[]}>(`${BASE}/portals/`).then(r => {setPortals(r.data.results);setForm(current=>({...current,portal:current.portal || r.data.results.find(portal=>portal.is_active !== false)?.slug || ""}));}).catch(err=>setMsg(adminError(err,"Não foi possível carregar os portais.")));
  }, []);
  useEffect(() => {
    if (!pairingId) return;
    let cancelled = false;
    setPairLoading(true);
    const timer = setTimeout(() => {
      void http.get<AdminListResult<Doc>>(`${BASE}/documents/`,{params:{compatible_with:pairingId,search:pairSearch,page:pairPage,page_size:12}}).then(r=>{if(!cancelled){setCompatibleDocs(r.data.results);setPairCount(r.data.count);}}).catch(err=>{if(!cancelled)setMsg(adminError(err,"Não foi possível carregar os documentos compatíveis."));}).finally(()=>{if(!cancelled)setPairLoading(false);});
    },300);
    return ()=>{cancelled=true;clearTimeout(timer);};
  }, [pairingId,pairSearch,pairPage]);
  const visibleDocs = docs;
  const download = async (id: number, force = false) => { try { const response = await http.post(BASE + "/documents/" + id + "/download/", force ? { force: true } : {}); setSuccess(response.status === 202 ? response.data.detail : "Download concluído: " + response.data.bytes + " bytes verificados."); void load(); } catch (error: any) { if (error?.response?.data?.code === "confirm_repeat" && window.confirm("Já existe um arquivo baixado. Deseja repetir o download e preservar o histórico anterior?")) { await download(id, true); return; } setMsg(error?.response?.data?.error || error?.response?.data?.detail || "Falha ao baixar o PDF."); } };
  const discard = async (id: number) => { if (!window.confirm("Descartar esta referência? Esta ação não poderá ser desfeita.")) return; try { await http.delete(`${BASE}/documents/${id}/`); setSuccess("Referência descartada."); if (detail?.id === id) setDetail(null); void load(); } catch (error: any) { setMsg(error?.response?.data?.detail || "Não foi possível descartar a referência."); } };
  const showDetail = async (id: number) => { try { const response = await http.get(`${BASE}/documents/${id}/`); setDetail(response.data); } catch (error: any) { setMsg(error?.response?.data?.detail || "Não foi possível carregar os detalhes."); } };
  const pair = async () => { if (!pairingId || !selectedPairId) return; try { await http.post(`${BASE}/documents/${pairingId}/pair/`, { paired_with: Number(selectedPairId) }); setPairingId(null); setSelectedPairId(""); setSuccess("Prova e gabarito foram associados."); void load(); } catch (error: any) { setMsg(error?.response?.data?.detail || "Não foi possível associar os documentos."); } };
  const save = async () => { try { await http.post(`${BASE}/documents/`, { ...form, year: form.year ? Number(form.year) : null }); setSuccess("Referência salva para conferência. O arquivo ainda não foi baixado."); setFormOpen(false); setForm((current) => ({ ...current, title: "", year: "", source_url: "" })); void load(); } catch (error: any) { const data = error?.response?.data; setMsg(data?.source_url?.[0] || data?.portal?.[0] || data?.detail || "Não foi possível salvar a referência."); } };
  const discover = async (slug: string) => { try { const response = await http.post(BASE + "/portals/" + slug + "/discover/"); setPortalsOpen(false); setPreview({ slug, candidates: response.data.candidates }); setSuccess(response.data.detail); } catch (error: any) { setMsg(error?.response?.data?.detail || "Não foi possível pesquisar documentos neste portal."); } };
  const persistPreview = async () => { if (!preview) return; try { const response = await http.post(BASE + "/portals/" + preview.slug + "/discover/", { persist: true }); setSuccess(response.data.detail); setPreview(null); void load(); } catch (error: any) { setMsg(error?.response?.data?.detail || "Não foi possível salvar as referências."); } };
  const exportPackage = async (includeFiles = false) => { try { const response = await http.get(`${BASE}/export/`, { params: { ...filters, page: undefined, page_size: undefined, ...(includeFiles ? { include_files: 1 } : {}) }, responseType: includeFiles ? "blob" : "json" }); const blob = includeFiles ? response.data : new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = includeFiles ? "acervo-provas-oficiais.zip" : "acervo-provas-manual.json"; link.click(); URL.revokeObjectURL(url); setSuccess(includeFiles ? "Pacote ZIP com PDFs privados exportado." : `${response.data.count} documento(s) exportado(s) para preparação manual.`); } catch { setMsg("Não foi possível exportar o pacote. Refine os filtros se ele exceder o limite."); } };

  return <div className="space-y-6">
    <PageHeader title="Acervo de provas oficiais" description="Localize, registre, baixe e confira provas e gabaritos. PDFs não viram questões automaticamente." actions={<><Button variant="outline" onClick={()=>setPortalsOpen(true)}><Globe className="h-4 w-4"/>Portais oficiais</Button>{canManage && <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={()=>{setMsg(undefined);setFormOpen(true);}}><Plus className="h-4 w-4"/>Adicionar referência</Button>}</>} />
    {msg && <Notice kind="error">{msg}</Notice>}
    {success && <Notice kind="success">{success}</Notice>}
    {error && <Notice kind="error">{error}<Button variant="ghost" onClick={()=>void load()}>Tentar novamente</Button></Notice>}
    <CatalogSummary label="Resumo do acervo" metrics={metrics} overview={data?.overview} query={filters} change={change} clear={clear}/>
    <Dialog open={portalsOpen} onOpenChange={setPortalsOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Portais oficiais</DialogTitle><DialogDescription>Consulte a origem e revise a prévia antes de registrar documentos.</DialogDescription></DialogHeader>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{portals.map((portal) => <article key={portal.slug} className="rounded-lg border p-4"><h2 className="font-semibold">{portal.name}</h2><p className="mt-2 text-sm text-slate-500">{portal.documents_count} documento(s) registrado(s)</p><a className="mt-3 inline-flex text-sm underline" href={portal.catalog_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-4 w-4" />Abrir portal oficial</a>{canManage && <Button disabled={busy} variant="outline" size="sm" className="mt-3" onClick={() => void execute(()=>discover(portal.slug))}>Pesquisar documentos</Button>}</article>)}</div>
    </DialogContent></Dialog>
    {preview && <section className="rounded-lg border border-blue-200 bg-blue-50 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Prévia de documentos encontrados</h2><p className="mt-1 text-sm text-slate-600">Revise os links oficiais antes de criar referências no acervo.</p></div><Button variant="outline" size="sm" onClick={() => setPreview(null)}>Fechar</Button></div><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{preview.candidates.map((candidate) => <div key={candidate.source_url} className="rounded border bg-white p-3 text-sm"><p className="font-medium">{labels[candidate.kind] || candidate.kind} · {candidate.title}{candidate.year ? ` (${candidate.year})` : ""}</p><p className="break-all text-slate-600">{candidate.source_url}</p><p className="mt-1 text-xs text-slate-500">{candidate.already_registered ? "Já registrado" : "Novo"}</p></div>)}{!preview.candidates.length && <p className="text-sm text-slate-600">Nenhum PDF de prova ou gabarito foi localizado nesta página.</p>}</div><Button className="mt-4" onClick={() => void execute(persistPreview)} disabled={busy || !preview.candidates.some((candidate) => !candidate.already_registered)}>Salvar novas referências</Button></section>}
    <Dialog open={formOpen} onOpenChange={open=>{if(!busy)setFormOpen(open);}}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Registrar referência oficial</DialogTitle><DialogDescription>Cadastre a origem do documento para conferência. O download é uma etapa separada.</DialogDescription></DialogHeader>
        {msg && <Notice kind="error">{msg}</Notice>}
        <form onSubmit={event=>{event.preventDefault();void execute(save);}} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">Portal<select aria-label="Portal da referência" value={form.portal} onChange={event=>setForm({...form,portal:event.target.value})} className="block h-10 w-full rounded border bg-background px-3">{portals.filter(portal=>portal.is_active !== false).map(portal=><option key={portal.slug} value={portal.slug}>{portal.name}</option>)}</select></label>
            <label className="space-y-2 text-sm font-medium">Tipo<select aria-label="Tipo da referência" value={form.kind} onChange={event=>setForm({...form,kind:event.target.value})} className="block h-10 w-full rounded border bg-background px-3"><option value="exam">Prova</option><option value="answer_key_preliminary">Gabarito preliminar</option><option value="answer_key_final">Gabarito final</option></select></label>
            {([['organization','Órgão ou banca'],['role','Cargo (opcional)'],['title','Título do documento'],['year','Ano'],['source_url','URL oficial do PDF']] as const).map(([key,label])=><label key={key} className={`space-y-2 text-sm font-medium ${key === 'source_url' ? 'md:col-span-2' : ''}`}>{label}<Input aria-label={label} type={key === 'source_url' ? 'url' : key === 'year' ? 'number' : 'text'} required={key === 'title' || key === 'source_url'} value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}
          </div>
          <Button type="submit" disabled={busy || !form.portal || !form.title.trim() || !form.source_url.trim()}><Plus className="h-4 w-4"/>{busy ? 'Salvando...' : 'Salvar para conferência'}</Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={pairingId !== null} onOpenChange={open=>{if(!open)setPairingId(null);}}><DialogContent><DialogHeader><DialogTitle>Associar prova e gabarito</DialogTitle><DialogDescription>Pesquise documentos disponíveis do mesmo portal. A associação exige tipos compatíveis.</DialogDescription></DialogHeader>
      {msg && <Notice kind="error">{msg}</Notice>}<Input aria-label="Buscar documento compatível" placeholder="Buscar pelo título, órgão ou cargo" value={pairSearch} onChange={e=>{setPairSearch(e.target.value);setPairPage(1);setSelectedPairId("");}}/>
      {pairLoading ? <LoadingState/> : compatibleDocs.length ? <select aria-label="Documento compatível" className="h-10 w-full rounded border bg-background px-3" value={selectedPairId} onChange={e=>setSelectedPairId(e.target.value)}><option value="">Selecione um documento</option>{compatibleDocs.map(doc=><option key={doc.id} value={doc.id}>{labels[doc.kind]} · {doc.title} {doc.year || ""}</option>)}</select> : <EmptyState title="Nenhum documento compatível encontrado"/>}
      <div className="flex justify-between"><Button variant="outline" disabled={pairLoading || pairPage<=1} onClick={()=>{setPairPage(v=>v-1);setSelectedPairId("");}}>Anterior</Button><span className="text-sm">{pairPage} · {pairCount} candidatos</span><Button variant="outline" disabled={pairLoading || pairPage*12>=pairCount} onClick={()=>{setPairPage(v=>v+1);setSelectedPairId("");}}>Próxima</Button></div>
      <Button disabled={busy || pairLoading || !selectedPairId} onClick={()=>void execute(pair)}><Link2 className="h-4 w-4"/>Confirmar associação</Button>
    </DialogContent></Dialog>
    {detail && <Dialog open onOpenChange={open=>{if(!open)setDetail(null);}}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Histórico do documento</DialogTitle><DialogDescription>Origem e tentativas de download.</DialogDescription></DialogHeader><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Detalhes: {detail.title}</h2><a href={detail.source_url} target="_blank" rel="noreferrer" className="text-sm underline">Abrir URL de origem</a></div><Button variant="outline" size="sm" onClick={() => setDetail(null)}>Fechar</Button></div><div className="mt-4 space-y-3 text-sm">{detail.events.length ? detail.events.map((event) => <div key={event.id} className="rounded border p-3"><p><strong>{labels[event.status] || event.status}</strong> · HTTP {event.http_status || "—"} · {event.bytes} bytes</p><p className="break-all text-slate-600">SHA-256: {event.sha256 || "—"}</p><p className="break-all text-slate-600">URL final: {event.final_url || "—"}</p>{event.error && <p className="text-red-700">Erro: {event.error}</p>}</div>) : <p className="text-slate-600">Nenhuma tentativa de download registrada.</p>}</div></DialogContent></Dialog>}
    <FilterBar active={hasFilters} onClear={clear}>
      <div className="space-y-2 xl:flex-1"><label htmlFor="document-search" className="text-sm font-medium">Buscar documento</label><Input id="document-search" placeholder="Título, órgão ou cargo" value={filters.search} onChange={e=>change("search",e.target.value)}/></div>
      <AdminFilterSelect id="document-portal" label="Portal" value={filters.portal} onChange={v=>change("portal",v)} options={[["all","Todos os portais"],...portals.map(p=>[p.slug,p.name] as [string,string])]}/>
      <AdminFilterSelect id="document-kind" label="Tipo" value={filters.kind} onChange={v=>change("kind",v)} options={[["all","Todos os tipos"],["exam","Prova"],["answer_key_preliminary","Gabarito preliminar"],["answer_key_final","Gabarito final"]]}/>
      <AdminFilterSelect id="document-status" label="Status" value={filters.status} onChange={v=>change("status",v)} options={[["all","Todos os status"],["discovered","Descoberto"],["review","Aguardando conferência"],["downloaded","Baixado"],["failed","Falhou"]]}/>
      <AdminFilterSelect id="document-category" label="Grupo" value={filters.category} onChange={v=>change("category",v)} options={[["all","Todos"],["keys","Gabaritos"]]}/>
      <AdminFilterSelect id="document-pending" label="Associação" value={filters.pending} onChange={v=>change("pending",v)} options={[["all","Todas"],["1","Provas sem gabarito"]]}/>
      {[['year','Ano'],['organization','Órgão ou banca'],['role','Cargo']].map(([key,label])=><div className="space-y-2" key={key}><label htmlFor={`filter-${key}`} className="text-sm font-medium">{label}</label><Input id={`filter-${key}`} className={key === 'year' ? 'sm:w-28' : 'sm:w-44'} value={filters[key]} onChange={e=>change(key,e.target.value)}/></div>)}
    </FilterBar>
    <ListToolbar count={data?.count ?? 0} loading={loading} ordering={filters.ordering} onOrderingChange={v=>change("ordering",v)} options={[{value:"recent",label:"Mais recentes"},{value:"title",label:"Título A–Z"},{value:"year",label:"Ano mais recente"}]}><div className="flex flex-wrap gap-2"><Button disabled={busy || loading} variant="outline" size="sm" onClick={()=>void execute(()=>exportPackage())}>Exportar JSON</Button><Button disabled={busy || loading} variant="outline" size="sm" onClick={()=>void execute(()=>exportPackage(true))}>Exportar ZIP com PDFs</Button></div><p className="text-xs text-slate-500">Exportação de todos os resultados filtrados · até 500 documentos</p></ListToolbar>
    {loading ? <LoadingState label="Carregando acervo..."/> : !visibleDocs.length ? <EmptyState icon={<Archive/>} title="Nenhum documento encontrado" description="Revise os filtros ou adicione uma referência oficial."/> : <div className="min-w-0 overflow-hidden rounded-xl border"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-50 dark:bg-slate-900"><tr className="border-b text-left">{["Documento","Portal / Tipo","Situação","PDF","Associação","Ações"].map(label=><th key={label} className="p-4 font-medium">{label}</th>)}</tr></thead><tbody>{visibleDocs.map(doc=><tr key={doc.id} className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50"><td className="max-w-64 p-4"><p className="font-medium">{doc.title}</p><p className="mt-1 text-xs text-slate-500">#{doc.id} · {doc.year || "Sem ano"} · {doc.organization || "Órgão não informado"}{doc.role && ` · ${doc.role}`}</p></td><td className="p-4">{doc.portal_name}<p className="text-xs text-slate-500">{labels[doc.kind]}</p></td><td className="p-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{labels[doc.status] || doc.status}</span><p className="mt-2 text-xs text-slate-500">{labels[doc.workflow_status] || "Gabarito"}</p></td><td className="max-w-48 p-4 text-xs">{doc.download ? doc.download.status === "done" ? `Baixado · ${doc.download.bytes} bytes` : doc.download.status === "running" ? "Em processamento" : doc.download.error || "Falhou" : "Não baixado"}</td><td className="p-4 text-xs">{doc.paired_with ? `Documento #${doc.paired_with}` : "Não associado"}</td><td className="p-4"><div className="flex max-w-64 flex-wrap items-center gap-2"><a className="underline" href={doc.source_url} target="_blank" rel="noreferrer">Origem</a>{canManage && <Button size="sm" variant="outline" disabled={busy || doc.download?.status === "running"} onClick={()=>void execute(()=>download(doc.id))}>Baixar</Button>}{doc.download?.status === "done" && <a className="underline" href={`${BASE}/documents/${doc.id}/file/`}>Arquivo</a>}<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void execute(()=>showDetail(doc.id))}>Detalhes</Button>{canManage && <><Button size="sm" variant="ghost" disabled={busy || !!doc.paired_with} onClick={()=>{setMsg(undefined);setPairingId(doc.id);setPairSearch("");setPairPage(1);setSelectedPairId("");}}>Associar</Button><Button size="sm" variant="ghost" className="text-rose-600" disabled={busy || doc.download?.status === "done"} onClick={()=>void execute(()=>discard(doc.id))}>Descartar</Button></>}</div></td></tr>)}</tbody></table></div></div>}
    <ListPagination count={data?.count ?? 0} page={Number(filters.page)} pageSize={Number(filters.page_size)} disabled={loading || busy} onPageChange={v=>change("page",String(v))} onPageSizeChange={v=>change("page_size",String(v))}/>
  </div>;
}
