"use client";
import { FormEvent, useRef, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Search, Landmark, FilePen, CloudDownload, Eye } from "lucide-react";
import { editorial, EditorialConcurso } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useAdminListing, adminError } from "@/components/admin/useAdminListing";
import { FilterBar, ListToolbar, ListPagination, AdminFilterSelect } from "@/components/admin/ListControls";
import { CatalogSummary, CatalogMetric } from "@/components/admin/CatalogSummary";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const defaults = {search:"",origin:"",editorial_status:"",status:"",state:"",ordering:"recent",page:"1",page_size:"12"};
const statuses: [string,string][] = [["expected","Previsto"],["open","Inscrições abertas"],["closed","Encerrado"]];
const metrics: CatalogMetric[] = [
  {key:"total",title:"Total",hint:"Todos os concursos",icon:<Landmark className="h-4 w-4"/>},
  {key:"manual",title:"Manuais",hint:"Cadastro editorial",icon:<FilePen className="h-4 w-4"/>,filter:["origin","manual"],accent:"sky"},
  {key:"imported",title:"Importados",hint:"Dados de origem protegidos",icon:<CloudDownload className="h-4 w-4"/>,filter:["origin","imported"],accent:"violet"},
  {key:"published",title:"Publicados",hint:"Disponíveis editorialmente",icon:<Eye className="h-4 w-4"/>,filter:["editorial_status","published"],accent:"emerald"},
  {key:"archived",title:"Arquivados",hint:"Histórico preservado",icon:<Archive className="h-4 w-4"/>,filter:["editorial_status","archived"],accent:"amber"},
];
export default function ConcursosPage() {
  const listing = useAdminListing(defaults, editorial.listConcursos);
  const {query,data,loading,error,forbidden,change,clear,hasFilters} = listing;
  const canManage = data?.can_manage === true && !forbidden;
  const [editing,setEditing] = useState<Partial<EditorialConcurso>|null>(null);
  const [businessStatus,setBusinessStatus] = useState("expected");
  const [target,setTarget] = useState<EditorialConcurso|null>(null);
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const [formError,setFormError] = useState<string|null>(null);
  const [actionError,setActionError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const open = (row?: EditorialConcurso) => {setFormError(null);setEditing(row || {title:"",organization:"",state:"",origin:"manual",source_url:""});setBusinessStatus(row?.status || "expected");};
  const imported = editing?.origin === "imported";
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editing || imported || lock.current) return;
    lock.current=true;setBusy(true);setFormError(null);
    const form=new FormData(event.currentTarget);
    const payload={title:String(form.get("title")).trim(),organization:String(form.get("organization")).trim(),state:String(form.get("state")).trim().toUpperCase(),status:businessStatus,source_url:String(form.get("source_url")).trim()};
    try {if(editing.id) await editorial.updateConcurso(editing.id,payload);else await editorial.createConcurso(payload);setEditing(null);setNotice("Concurso salvo.");void listing.reload();}
    catch(err){setFormError(adminError(err,"Não foi possível salvar o concurso."));}finally{lock.current=false;setBusy(false);}
  };
  const archive=async()=>{if(!target || lock.current)return;lock.current=true;setBusy(true);setActionError(null);try{await editorial.updateConcurso(target.id,{editorial_status:target.editorial_status==="archived"?"published":"archived"});setNotice(target.editorial_status==="archived"?"Concurso restaurado.":"Concurso arquivado.");setTarget(null);void listing.reload();}catch(err){setActionError(adminError(err,"Não foi possível alterar a publicação."));}finally{lock.current=false;setBusy(false);}};
  return <div className="space-y-6">
    <PageHeader title="Concursos" description="Organize concursos manuais e importados, mantendo os dados de origem protegidos." actions={canManage?<Button onClick={()=>open()} className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"><Plus className="h-4 w-4"/>Novo concurso</Button>:undefined}/>
    <FloatingNotice message={notice} onDismiss={()=>setNotice(null)}/>
    {error&&<Notice kind="error">{error}{!forbidden&&<Button size="sm" variant="ghost" onClick={()=>void listing.reload()}>Tentar novamente</Button>}</Notice>}
    {!forbidden&&<>
    <CatalogSummary label="Resumo geral dos concursos" metrics={metrics} overview={data?.overview} query={query} change={change} clear={clear}/>
    <FilterBar active={hasFilters} onClear={clear}><div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="concurso-search">Buscar concursos</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input id="concurso-search" value={query.search} onChange={event=>change("search",event.target.value)} placeholder="Título ou órgão" className="pl-9"/></div></div><AdminFilterSelect id="concurso-origin" label="Origem" value={query.origin} options={[["all","Todas as origens"],["manual","Manual"],["imported","Importado"]]} onChange={value=>change("origin",value)}/><AdminFilterSelect id="concurso-editorial" label="Publicação" value={query.editorial_status} options={[["all","Todas as publicações"],["published","Publicados"],["archived","Arquivados"]]} onChange={value=>change("editorial_status",value)}/><AdminFilterSelect id="concurso-status" label="Situação" value={query.status} options={[["all","Todas as situações"],...statuses]} onChange={value=>change("status",value)}/><div className="space-y-2"><Label htmlFor="concurso-state">UF</Label><Input id="concurso-state" value={query.state} maxLength={2} onChange={event=>change("state",event.target.value.toUpperCase())} placeholder="Todas" className="w-full sm:w-24"/></div></FilterBar>
    <ListToolbar count={data?.count||0} loading={loading} ordering={query.ordering} onOrderingChange={value=>change("ordering",value)} options={[{value:"recent",label:"Atualizados recentemente"},{value:"name",label:"Título (A–Z)"},{value:"-name",label:"Título (Z–A)"}]}/>
    <Card className="min-w-0 overflow-hidden"><Table aria-label="Lista de concursos" className="min-w-[800px]"><TableHeader className="bg-slate-50 dark:bg-slate-800/50"><TableRow><TableHead>Concurso / órgão</TableHead><TableHead>Origem</TableHead><TableHead>Situação</TableHead><TableHead>Provas</TableHead><TableHead>Publicação</TableHead>{canManage&&<TableHead className="text-right">Ações</TableHead>}</TableRow></TableHeader><TableBody>
      {loading&&<TableRow><TableCell colSpan={6}><LoadingState label="Carregando concursos..."/></TableCell></TableRow>}
      {!loading&&!error&&!data?.results.length&&<TableRow><TableCell colSpan={6}><EmptyState title={hasFilters?"Nenhum concurso corresponde aos filtros":"Nenhum concurso cadastrado"} description={hasFilters?"Ajuste a busca ou limpe os filtros.":"Adicione o primeiro concurso manual."}/><div className="flex justify-center pb-6">{hasFilters?<Button variant="outline" onClick={clear}>Limpar filtros</Button>:canManage&&<Button variant="outline" onClick={()=>open()}>Novo concurso</Button>}</div></TableCell></TableRow>}
      {!loading&&!error&&data?.results.map(row=><TableRow key={row.id}><TableCell><p className="font-medium">{row.title}</p><p className="text-xs text-slate-500">{row.organization||"Órgão não informado"}{row.state&&` · ${row.state}`}</p></TableCell><TableCell>{row.origin==="manual"?"Manual":"Importado"}</TableCell><TableCell><StatusBadge status={row.status}/></TableCell><TableCell>{row.exams_count}</TableCell><TableCell><StatusBadge status={row.editorial_status}/></TableCell>{canManage&&<TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={()=>open(row)} aria-label={`Detalhes do concurso ${row.title}`}><Pencil className="h-3.5 w-3.5"/>Detalhes</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setTarget(row);setActionError(null);}} aria-label={`${row.editorial_status==="archived"?"Restaurar":"Arquivar"} concurso ${row.title}`}>{row.editorial_status==="archived"?<ArchiveRestore className="h-3.5 w-3.5"/>:<Archive className="h-3.5 w-3.5"/>}{row.editorial_status==="archived"?"Restaurar":"Arquivar"}</Button></div></TableCell>}</TableRow>)}
    </TableBody></Table></Card>
    <ListPagination count={data?.count||0} page={Number(query.page)} pageSize={Number(query.page_size)} disabled={loading} onPageChange={value=>change("page",String(value))} onPageSizeChange={value=>change("page_size",String(value))}/>
    </>}
    <Dialog open={!!editing} onOpenChange={value=>{if(!value&&!busy)setEditing(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing?.id?"Detalhes do concurso":"Novo concurso"}</DialogTitle><DialogDescription>{imported?"Dados importados são somente para consulta. O arquivamento editorial continua disponível na lista.":"Cadastre ou atualize os dados do concurso manual."}</DialogDescription></DialogHeader>{editing&&<form key={editing.id||"new"} onSubmit={save} className="space-y-4">{formError&&<Notice kind="error">{formError}</Notice>}<fieldset disabled={busy||imported} className="space-y-4">{([["title","Título",true],["organization","Órgão",false],["state","UF",false],["source_url","URL de referência",false]] as const).map(([key,label,required])=><div key={key} className="space-y-2"><Label htmlFor={`edit-concurso-${key}`}>{label}{required?" *":""}</Label><Input id={`edit-concurso-${key}`} name={key} defaultValue={editing[key]||""} required={required} type={key==="source_url"?"url":"text"} maxLength={key==="state"?2:key==="title"?300:key==="organization"?255:600}/></div>)}<AdminFilterSelect id="edit-concurso-status" label="Situação" value={businessStatus} options={statuses} disabled={busy||imported} onChange={setBusinessStatus}/></fieldset><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(null)}>{imported?"Fechar":"Cancelar"}</Button>{!imported&&<Button type="submit" disabled={busy}>{busy?"Salvando...":"Salvar concurso"}</Button>}</DialogFooter></form>}</DialogContent></Dialog>
    <ConfirmAction open={!!target} title={target?.editorial_status==="archived"?"Restaurar concurso":"Arquivar concurso"} description={`${target?.title||""}. A alteração afeta a publicação editorial e preserva os dados e as provas vinculadas.`} busy={busy} error={actionError} onClose={()=>setTarget(null)} onConfirm={()=>void archive()}/>
  </div>;
}
