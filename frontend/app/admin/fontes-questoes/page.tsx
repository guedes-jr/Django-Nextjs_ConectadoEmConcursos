"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, ShieldCheck, Database, CheckCircle, AlertTriangle, Pause, ListChecks, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, LoadingState, Notice } from "@/components/admin/Notice";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/components/admin/questions/SearchDialog";
import { adminUrl } from "@/lib/admin";
import { type SearchRun, type SourceCatalogItem } from "@/lib/content";

import { http } from "@/lib/http";
import { Input } from "@/components/ui/input";
import { CatalogSummary, type CatalogMetric } from "@/components/admin/CatalogSummary";
import { FilterBar, AdminFilterSelect, ListToolbar, ListPagination } from "@/components/admin/ListControls";
import { useAdminListing, type AdminListResult } from "@/components/admin/useAdminListing";
const defaults = {search:"", availability:"", pending:"", ordering:"name", page:"1", page_size:"12"};
const fetchSources = (params: Record<string,string>) => http.get<AdminListResult<SourceCatalogItem> & {can_configure:boolean}>("/api/backoffice/content/sources/catalog/", {params}).then(r=>r.data);
const metrics: CatalogMetric[] = [
  {key:"total",title:"Fontes",hint:"Total cadastrado",icon:<Database/>},
  {key:"ready",title:"Prontas",hint:"Ativas com licença",icon:<CheckCircle/>,accent:"emerald",filter:["availability","ready"]},
  {key:"missing_license",title:"Sem licença",hint:"Configuração pendente",icon:<AlertTriangle/>,accent:"amber",filter:["availability","missing_license"]},
  {key:"inactive",title:"Inativas",hint:"Coleta desativada",icon:<Pause/>,filter:["availability","inactive"]},
  {key:"pending",title:"Com fila",hint:"Fontes com itens pendentes",icon:<ListChecks/>,filter:["pending","1"]},
];
export default function FontesQuestoesPage() {
  const {query,data,loading,error,reload,change,clear,hasFilters} = useAdminListing(defaults, fetchSources);
  const sources = data?.results ?? [];
  const canManage = data?.can_manage ?? false;
  const [initialSource,setInitialSource] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const imported = (run: SearchRun) => {
    setFeedback({kind: run.status === "failed" ? "error" : "success", message: `Busca #${run.id}: ${run.status === "failed" ? "falhou" : run.status === "partial" ? "concluída parcialmente" : run.status === "running" ? "em processamento" : "concluída"}. Consulte os resultados na fila e no histórico de buscas. Simulações não gravam questões.`});
    void reload();
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Fontes de questões"
        description="Escolha uma fonte autorizada, refine os filtros e envie o resultado para a fila de revisão."
        actions={<>{canManage && <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => {setInitialSource(undefined);setDialogOpen(true);}}><Search className="h-4 w-4"/>Nova busca</Button>}{data?.permissions?.can_create_source && <Button className="bg-emerald-600 text-white hover:bg-emerald-700" asChild><a href={adminUrl("questions/questionsource/add/")}><Plus className="h-4 w-4"/>Cadastrar fonte</a></Button>}</> }
      />
      {error && <Notice kind="error">{error}<Button variant="ghost" onClick={() => void reload()}>Tentar novamente</Button></Notice>}
      {feedback && <Notice kind={feedback.kind}>{feedback.message}</Notice>}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100">
        <ShieldCheck className="mr-2 inline h-4 w-4" /> A busca não publica questões: ela apenas cria itens pendentes. A aprovação acontece separadamente na <Link className="font-medium underline" href="/admin/fila-questoes">fila de revisão</Link>.
      </div>
      <CatalogSummary label="Resumo das fontes" metrics={metrics} overview={data?.overview} query={query} change={change} clear={clear}/>
      <FilterBar active={hasFilters} onClear={clear}>
        <div className="space-y-2 xl:flex-1"><label htmlFor="source-search" className="text-sm font-medium">Buscar fonte</label><Input id="source-search" placeholder="Nome, identificador ou licença" value={query.search} onChange={e=>change("search",e.target.value)}/></div>
        <AdminFilterSelect id="source-state" label="Disponibilidade" value={query.availability} onChange={v=>change("availability",v)} options={[["all","Todas"],["ready","Prontas"],["missing_license","Sem licença"],["inactive","Inativas"]]}/>
        <AdminFilterSelect id="source-pending" label="Revisão" value={query.pending} onChange={v=>change("pending",v)} options={[["all","Todas as fontes"],["1","Com itens na fila"]]}/>
      </FilterBar>
      <ListToolbar count={data?.count ?? 0} loading={loading} ordering={query.ordering} onOrderingChange={v=>change("ordering",v)} options={[{value:"name",label:"Nome A–Z"},{value:"-name",label:"Nome Z–A"},{value:"pending",label:"Mais pendências"},{value:"recent",label:"Mais recentes"}]}/>
      {loading ? <LoadingState label="Carregando fontes..."/> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((source) => (
            <article key={source.slug} className="flex min-h-60 flex-col rounded-xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-slate-100">{source.label}</h2><p className="mt-1 text-xs text-slate-500">{source.kind.replaceAll("_", " ")}</p></div><span className={source.ready_for_import ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"}>{source.ready_for_import ? "Pronta" : "Configuração pendente"}</span></div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{source.availability_message}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div><dt className="text-slate-500">Na fila</dt><dd className="mt-1 font-semibold">{source.pending_total}</dd></div><div><dt className="text-slate-500">Importadas</dt><dd className="mt-1 font-semibold">{source.questions_total}</dd></div><div><dt className="text-slate-500">Buscas</dt><dd className="mt-1 font-semibold">{source.runs_total}</dd></div></dl>
              <p className="mt-4 text-xs text-slate-500">Licença: {source.license_name || "não informada"}</p>
              <div className="mt-auto flex gap-2 pt-4">{canManage && source.ready_for_import ? <Button size="sm" onClick={() => {setInitialSource(source.slug);setDialogOpen(true);}}>Buscar e enviar à fila</Button> : data?.permissions?.can_change_source ? <Button size="sm" variant="outline" asChild><a href={adminUrl(`questions/questionsource/${source.id}/change/`)}>Configurar</a></Button> : null}{source.home_url && <Button size="sm" variant="ghost" asChild><a href={source.home_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Origem</a></Button>}</div>
            </article>
          ))}
          {sources.length === 0 && <EmptyState title="Nenhuma fonte encontrada" description="Revise os filtros ou cadastre uma fonte autorizada."/>}
        </div>
      )}
      <ListPagination count={data?.count ?? 0} page={Number(query.page)} pageSize={Number(query.page_size)} disabled={loading} onPageChange={v=>change("page",String(v))} onPageSizeChange={v=>change("page_size",String(v))}/>
      <SearchDialog initialSource={initialSource} open={dialogOpen} onOpenChange={setDialogOpen} onFinished={imported} />
    </div>
  );
}
