"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Search, Files, Link2, Unlink } from "lucide-react";
import { editorial, EditorialExam } from "@/lib/backoffice";
import { BancaSelect } from "@/components/admin/BancaSelect";
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

const defaults={banca_catalog:"",search:"",published:"",concurso:"",linked:"",year:"",ordering:"year",page:"1",page_size:"12"};
const metrics:CatalogMetric[]=[
  {key:"total",title:"Total",hint:"Todas as provas",icon:<Files className="h-4 w-4"/>},
  {key:"published",title:"Publicadas",hint:"Visíveis aos alunos",icon:<Eye className="h-4 w-4"/>,filter:["published","1"],accent:"emerald"},
  {key:"draft",title:"Rascunhos",hint:"Não publicadas",icon:<EyeOff className="h-4 w-4"/>,filter:["published","0"],accent:"amber"},
  {key:"linked",title:"Vinculadas",hint:"Com concurso associado",icon:<Link2 className="h-4 w-4"/>,filter:["linked","1"],accent:"sky"},
  {key:"unlinked",title:"Sem vínculo",hint:"Sem concurso associado",icon:<Unlink className="h-4 w-4"/>,filter:["linked","0"],accent:"violet"},
];
export default function ProvasPage(){
  const listing=useAdminListing(defaults,editorial.listExams);
  const {query,data,loading,error,forbidden,change,clear,hasFilters}=listing;
  const canManage=data?.can_manage===true&&!forbidden;
  const [options,setOptions]=useState<{id:number;title:string}[]>([]);
  const [optionsError,setOptionsError]=useState(false);
  const [optionsLoading,setOptionsLoading]=useState(true);
  const [editing,setEditing]=useState<Partial<EditorialExam>|null>(null);
  const [concurso,setConcurso]=useState("");
  const [banca,setBanca]=useState("");
  const [target,setTarget]=useState<EditorialExam|null>(null);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [formError,setFormError]=useState<string|null>(null);
  const [actionError,setActionError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const loadOptions=useCallback(async()=>{setOptionsLoading(true);try{setOptions((await editorial.concursoOptions()).results);setOptionsError(false);}catch{setOptionsError(true);}finally{setOptionsLoading(false);}},[]);
  useEffect(()=>{void loadOptions();},[loadOptions]);
  const open=(row?:EditorialExam)=>{setEditing(row||{title:"",banca:"",year:new Date().getFullYear(),institution:"",role:"",level:"",state:"",is_published:false,concurso:null});setConcurso(row?.concurso?String(row.concurso):"");setBanca(row?.banca_catalog?String(row.banca_catalog):"");setFormError(null);};
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!editing||lock.current)return;lock.current=true;setBusy(true);setFormError(null);
    const form=new FormData(event.currentTarget);
    const payload={title:String(form.get("title")).trim(),...(banca?{banca_catalog:Number(banca)}:{banca:editing.banca||""}),year:Number(form.get("year")),institution:String(form.get("institution")).trim(),role:String(form.get("role")).trim(),level:String(form.get("level")).trim(),state:String(form.get("state")).trim().toUpperCase(),concurso:concurso?Number(concurso):null,is_published:form.get("is_published")==="on"};
    try{if(editing.id)await editorial.updateExam(editing.id,payload);else await editorial.createExam(payload);setEditing(null);setNotice("Prova salva.");void listing.reload();}catch(err){setFormError(adminError(err,"Revise os dados antes de salvar a prova."));}finally{lock.current=false;setBusy(false);}
  };
  const publish=async()=>{if(!target||lock.current)return;lock.current=true;setBusy(true);setActionError(null);try{await editorial.updateExam(target.id,{is_published:!target.is_published});setNotice(target.is_published?"Prova ocultada.":"Prova publicada.");setTarget(null);void listing.reload();}catch(err){setActionError(adminError(err,"Não foi possível alterar a publicação."));}finally{lock.current=false;setBusy(false);}};
  const concursoOptions:[string,string][]=[["all","Todos os concursos"],...options.map(item=>[String(item.id),item.title] as [string,string]),...(query.concurso&&!options.some(item=>String(item.id)===query.concurso)?[[query.concurso,`Concurso #${query.concurso}`] as [string,string]]:[])];
  return <div className="space-y-6">
    <PageHeader title="Provas" description="Organize os dados, os vínculos com concursos e a visibilidade das provas." actions={canManage?<Button onClick={()=>open()} className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"><Plus className="h-4 w-4"/>Nova prova</Button>:undefined}/>
    <FloatingNotice message={notice} onDismiss={()=>setNotice(null)}/>
    {error&&<Notice kind="error">{error}{!forbidden&&<Button size="sm" variant="ghost" onClick={()=>void listing.reload()}>Tentar novamente</Button>}</Notice>}
    {!forbidden&&<>
    <CatalogSummary label="Resumo geral das provas" metrics={metrics} overview={data?.overview} query={query} change={change} clear={clear}/>
    <FilterBar active={hasFilters} onClear={clear}><div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="exam-search">Buscar provas</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input id="exam-search" value={query.search} onChange={event=>change("search",event.target.value)} placeholder="Título, banca, instituição ou cargo" className="pl-9"/></div></div><BancaSelect id="exam-banca-filter" label="Banca" value={query.banca_catalog} onChange={value=>change("banca_catalog",value)} emptyLabel="Todas as bancas"/><AdminFilterSelect id="exam-published" label="Visibilidade" value={query.published} options={[["all","Todas as provas"],["1","Publicadas"],["0","Rascunhos"]]} onChange={value=>change("published",value)}/><AdminFilterSelect id="exam-concurso" label="Concurso" value={query.concurso} options={concursoOptions} onChange={value=>change("concurso",value)} disabled={optionsLoading}/><AdminFilterSelect id="exam-linked" label="Vínculo" value={query.linked} options={[["all","Qualquer vínculo"],["1","Com concurso"],["0","Sem concurso"]]} onChange={value=>change("linked",value)}/><div className="space-y-2"><Label htmlFor="exam-year">Ano</Label><Input id="exam-year" type="number" min="1980" max="2100" value={query.year} onChange={event=>change("year",event.target.value)} placeholder="Todos" className="w-full sm:w-28"/></div></FilterBar>
    {optionsError&&<Notice kind="error">Não foi possível carregar os concursos. <Button size="sm" variant="ghost" onClick={()=>void loadOptions()}>Recarregar concursos</Button></Notice>}
    <ListToolbar count={data?.count||0} loading={loading} ordering={query.ordering} onOrderingChange={value=>change("ordering",value)} options={[{value:"year",label:"Ano mais recente"},{value:"name",label:"Título (A–Z)"},{value:"recent",label:"Atualizadas recentemente"}]}/>
    <Card className="min-w-0 overflow-hidden"><Table aria-label="Lista de provas" className="min-w-[800px]"><TableHeader className="bg-slate-50 dark:bg-slate-800/50"><TableRow><TableHead>Prova / banca</TableHead><TableHead>Concurso</TableHead><TableHead>Questões</TableHead><TableHead>Visibilidade</TableHead>{canManage&&<TableHead className="text-right">Ações</TableHead>}</TableRow></TableHeader><TableBody>
      {loading&&<TableRow><TableCell colSpan={5}><LoadingState label="Carregando provas..."/></TableCell></TableRow>}
      {!loading&&!error&&!data?.results.length&&<TableRow><TableCell colSpan={5}><EmptyState title={hasFilters?"Nenhuma prova corresponde aos filtros":"Nenhuma prova cadastrada"} description={hasFilters?"Ajuste a busca ou limpe os filtros.":"Adicione a primeira prova para organizar o catálogo."}/><div className="flex justify-center pb-6">{hasFilters?<Button variant="outline" onClick={clear}>Limpar filtros</Button>:canManage&&<Button variant="outline" onClick={()=>open()}>Nova prova</Button>}</div></TableCell></TableRow>}
      {!loading&&!error&&data?.results.map(row=><TableRow key={row.id}><TableCell><p className="font-medium">{row.title}</p><p className="text-xs text-slate-500">{row.banca_name||row.banca} · {row.year}{row.state&&` · ${row.state}`}</p>{row.role&&<p className="text-xs text-slate-500">{row.role}</p>}</TableCell><TableCell>{row.concurso_title||"Sem concurso vinculado"}</TableCell><TableCell>{row.questions_count}</TableCell><TableCell><StatusBadge status={row.is_published?"published":"draft"}/></TableCell>{canManage&&<TableCell><div className="flex justify-end gap-2"><Button asChild size="sm" variant="outline"><Link href={`/exams/${row.id}`} target="_blank">Página do aluno</Link></Button><Button size="sm" variant="outline" onClick={()=>open(row)} aria-label={`Editar prova ${row.title}`}><Pencil className="h-3.5 w-3.5"/>Editar</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setTarget(row);setActionError(null);}} aria-label={`${row.is_published?"Ocultar":"Publicar"} prova ${row.title}`}>{row.is_published?<EyeOff className="h-3.5 w-3.5"/>:<Eye className="h-3.5 w-3.5"/>}{row.is_published?"Ocultar":"Publicar"}</Button></div></TableCell>}</TableRow>)}
    </TableBody></Table></Card>
    <ListPagination count={data?.count||0} page={Number(query.page)} pageSize={Number(query.page_size)} disabled={loading} onPageChange={value=>change("page",String(value))} onPageSizeChange={value=>change("page_size",String(value))}/>
    </>}
    <Dialog open={!!editing} onOpenChange={value=>{if(!value&&!busy)setEditing(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing?.id?"Editar prova":"Nova prova"}</DialogTitle><DialogDescription>Confira os dados e a visibilidade antes de salvar.</DialogDescription></DialogHeader>{editing&&<form key={editing.id||"new"} onSubmit={save} className="space-y-4">{formError&&<Notice kind="error">{formError}</Notice>}<fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{([["title","Título",true],["year","Ano",true],["institution","Instituição",false],["role","Cargo",false],["level","Nível",false],["state","UF",false]] as const).map(([key,label,required])=><div key={key} className="space-y-2"><Label htmlFor={`edit-exam-${key}`}>{label}{required?" *":""}</Label><Input id={`edit-exam-${key}`} name={key} defaultValue={editing[key]??""} required={required} type={key==="year"?"number":"text"} min={key==="year"?1980:undefined} max={key==="year"?2100:undefined} maxLength={key==="state"?2:key==="title"?200:key==="level"?40:160}/></div>)}<BancaSelect id="edit-exam-banca" value={banca} onChange={setBanca} legacyText={editing.banca} disabled={busy}/><AdminFilterSelect id="edit-exam-concurso" label="Concurso vinculado" value={concurso} options={[["all","Sem concurso vinculado"],...options.map(item=>[String(item.id),item.title] as [string,string]),...(concurso&&!options.some(item=>String(item.id)===concurso)?[[concurso,editing.concurso_title||`Concurso #${concurso}`] as [string,string]]:[])]} disabled={busy||optionsLoading} onChange={setConcurso}/><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_published" defaultChecked={editing.is_published}/>Publicar esta prova para os alunos</label></fieldset>{optionsError&&<Notice kind="error">Falha ao carregar concursos. <Button type="button" size="sm" variant="ghost" onClick={()=>void loadOptions()}>Recarregar concursos</Button></Notice>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</Button><Button type="submit" disabled={busy||optionsLoading||optionsError}>{busy?"Salvando...":"Salvar prova"}</Button></DialogFooter></form>}</DialogContent></Dialog>
    <ConfirmAction open={!!target} title={target?.is_published?"Ocultar prova":"Publicar prova"} description={`${target?.title||""}. ${target?.is_published?"A prova deixará de ser exibida aos alunos, preservando seu histórico.":"A prova ficará visível aos alunos conforme as regras de acesso da plataforma."}`} busy={busy} error={actionError} onClose={()=>setTarget(null)} onConfirm={()=>void publish()}/>
  </div>;
}
