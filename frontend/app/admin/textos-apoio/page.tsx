"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, Link2, Plus } from "lucide-react";
import { SupportText, supportTexts } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { CatalogSummary, CatalogMetric } from "@/components/admin/CatalogSummary";
import { FilterBar, ListPagination, AdminFilterSelect } from "@/components/admin/ListControls";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { useAdminListing, adminError } from "@/components/admin/useAdminListing";
import { EmptyState, LoadingState, Notice } from "@/components/admin/Notice";
import { QuestionHtmlEditor } from "@/components/admin/questions/QuestionHtmlEditor";
import { QuestionContent } from "@/components/QuestionContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const defaults={search:"",usage:"",page:"1",page_size:"12"};
const metrics:CatalogMetric[]=[{key:"total",title:"Textos",hint:"Catálogo completo",icon:<BookOpen className="h-4 w-4"/>},{key:"linked",title:"Textos em uso",hint:"Com questões vinculadas",icon:<FileText className="h-4 w-4"/>},{key:"questions",title:"Questões com texto",hint:"Vínculos em todo o acervo",icon:<Link2 className="h-4 w-4"/>}];
export default function SupportTextsPage(){
 const listing=useAdminListing(defaults,supportTexts.list);
 const {query,data,loading,change,clear,hasFilters}=listing;
 const canEdit=data?.permissions?.can_edit??false;
 const [editing,setEditing]=useState<Partial<SupportText>|null>(null),[content,setContent]=useState("");
 const [preview,setPreview]=useState<SupportText|null>(null),[deleting,setDeleting]=useState<SupportText|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState<string|null>(null);
 const lock=useRef(false);
 const edit=(text:Partial<SupportText>)=>{setEditing(text);setContent(text.content||"");setError("");};
 const save=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!editing||lock.current)return;lock.current=true;setBusy(true);setError("");const form=new FormData(event.currentTarget);const values={title:String(form.get("title")),reference:String(form.get("reference")),content};try{if(editing.id)await supportTexts.update({...editing,...values} as SupportText);else await supportTexts.create(values);setEditing(null);setNotice("Texto salvo. Vincule-o às questões na gestão de questões.");void listing.reload();}catch(err){setError(adminError(err,"Não foi possível salvar o texto."));}finally{lock.current=false;setBusy(false);}};
 return <div className="space-y-6"><PageHeader title="Textos de apoio" description="Cadastre uma vez e reutilize em várias questões. O aluno expande o texto acima do enunciado." actions={<div className="flex flex-wrap gap-2">{canEdit&&<Button onClick={()=>edit({})}><Plus className="h-4 w-4"/>Novo texto</Button>}<Button asChild variant="outline"><Link href="/admin/questoes">Questões</Link></Button></div>}/>
 <FloatingNotice message={notice} onDismiss={()=>setNotice(null)}/>
 {listing.error&&<Notice kind="error">{listing.error}<Button variant="ghost" onClick={()=>void listing.reload()}>Tentar novamente</Button></Notice>}
 <CatalogSummary label="Resumo geral dos textos" metrics={metrics} overview={data?.overview} query={query} change={change} clear={clear}/>
 <FilterBar active={hasFilters} onClear={clear}><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="support-search">Buscar textos</Label><Input id="support-search" value={query.search} onChange={e=>change("search",e.target.value)} placeholder="Título, conteúdo ou referência"/></div><AdminFilterSelect id="support-usage" label="Utilização" value={query.usage} options={[["all","Todos"],["linked","Com questões"],["unused","Sem questões"]]} onChange={value=>change("usage",value)}/></FilterBar>
 <p className="text-sm text-slate-500">{data?.count??0} textos encontrados</p>
 <Card className="overflow-hidden"><Table aria-label="Textos de apoio"><TableHeader><TableRow><TableHead>Texto</TableHead><TableHead>Questões</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{loading&&<TableRow><TableCell colSpan={3}><LoadingState label="Carregando textos..."/></TableCell></TableRow>}{!loading&&!listing.error&&!data?.results.length&&<TableRow><TableCell colSpan={3}><EmptyState title="Nenhum texto encontrado" description="Cadastre um texto ou ajuste os filtros."/></TableCell></TableRow>}{!loading&&data?.results.map(text=><TableRow key={text.id}><TableCell className="max-w-md"><b>#{text.id} · {text.title}</b><p className="line-clamp-2 text-xs text-slate-500">{text.reference||"Sem referência informada"}</p></TableCell><TableCell>{text.question_count}</TableCell><TableCell><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={()=>setPreview(text)}>Visualizar</Button>{canEdit&&<><Button variant="outline" size="sm" onClick={()=>edit(text)}>Editar</Button><Button variant="ghost" size="sm" disabled={text.question_count>0} title={text.question_count?"Remova os vínculos antes de excluir":undefined} onClick={()=>{setError("");setDeleting(text);}}>Excluir</Button></>}</div></TableCell></TableRow>)}</TableBody></Table></Card>
 <ListPagination count={data?.count??0} page={Number(query.page)} pageSize={Number(query.page_size)} disabled={loading} onPageChange={value=>change("page",String(value))} onPageSizeChange={value=>change("page_size",String(value))}/>
 <Dialog open={!!editing} onOpenChange={open=>{if(!open&&!busy)setEditing(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{editing?.id?"Editar texto de apoio":"Novo texto de apoio"}</DialogTitle><DialogDescription>Editar um texto atualiza todas as questões que o utilizam. Confira a referência e o direito de uso do material.</DialogDescription></DialogHeader>{error&&<Notice kind="error">{error}</Notice>}{editing&&<form onSubmit={save} className="space-y-4"><div className="space-y-2"><Label htmlFor="support-title">Título</Label><Input id="support-title" name="title" required maxLength={200} defaultValue={editing.title}/></div><fieldset><legend className="mb-2 text-sm font-semibold">Conteúdo do texto</legend><QuestionHtmlEditor value={content} onChange={setContent} placeholder="Digite ou cole o texto de apoio..."/></fieldset><div className="space-y-2"><Label htmlFor="support-reference">Referência / autoria (opcional)</Label><Input id="support-reference" name="reference" maxLength={600} defaultValue={editing.reference}/></div>{Boolean(editing.question_count)&&<p className="text-sm text-amber-700">Esta edição afetará {editing.question_count} questões vinculadas.</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</Button><Button disabled={busy} type="submit">Salvar texto</Button></DialogFooter></form>}</DialogContent></Dialog>
 <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>{preview?.reference||"Prévia do texto de apoio"}</DialogDescription></DialogHeader>{preview&&<QuestionContent text={preview.content}/>}</DialogContent></Dialog>
 <Dialog open={!!deleting} onOpenChange={open=>{if(!open&&!busy)setDeleting(null);}}><DialogContent><DialogHeader><DialogTitle>Excluir texto?</DialogTitle><DialogDescription>Excluir “{deleting?.title}” do catálogo. Textos vinculados a questões não podem ser excluídos.</DialogDescription></DialogHeader>{error&&<Notice kind="error">{error}</Notice>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={async()=>{if(!deleting||lock.current)return;lock.current=true;setBusy(true);try{await supportTexts.remove(deleting);setDeleting(null);setNotice("Texto excluído.");void listing.reload();}catch(err){setError(adminError(err,"Não foi possível excluir o texto."));}finally{lock.current=false;setBusy(false);}}}>Excluir texto</Button></DialogFooter></DialogContent></Dialog>
 </div>;
}
