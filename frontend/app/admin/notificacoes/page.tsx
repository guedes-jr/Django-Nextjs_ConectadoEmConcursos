"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminNotifications, AdminNotificationRow, NoticeOptions, NoticePage, NoticePermissions, NoticeRecipient } from "@/lib/backoffice";
import { Plus, Search, Bell, Pencil, Clock3, Eye, Archive } from "lucide-react";
import { useAdminListing } from "@/components/admin/useAdminListing";
import { FilterBar, ListToolbar, ListPagination, AdminFilterSelect } from "@/components/admin/ListControls";
import { CatalogSummary, CatalogMetric } from "@/components/admin/CatalogSummary";
import { Notice, EmptyState, LoadingState } from "@/components/admin/Notice";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/PageHeader";
import { NoticeContent } from "@/components/notifications/NoticeContent";

const empty = {
  title:"", summary:"", body:"", priority:"info", scope:"selected_users",
  segment_plan_slug:"", segment_subscription_status:"", starts_at:"", ends_at:"",
  image_url:"", video_url:"", links:[] as {label:string;url:string}[],
  postpone_hours:24, max_postpones:3, selected_user_ids:[] as number[],
};
const labels:Record<string,string> = {
  draft:"Rascunho", scheduled:"Agendado", published:"Publicado", closed:"Encerrado", archived:"Arquivado",
  info:"Informativo", maintenance:"Manutenção", news:"Novidade", urgent:"Urgente", required:"Obrigatório",
  pending:"Pendente", viewed:"Confirmado", postponed:"Adiado", dismissed:"Dispensado",
};
const subscriptionStatuses = {active:"Ativa", pending_payment:"Pagamento pendente", canceled:"Cancelada"};
const selectClass = "h-10 rounded-md border bg-white px-3 text-sm dark:bg-slate-900";
const formatDate = (value:string|null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
function inputDate(value:string|null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}
function errorMessage(error:unknown) {
  const data = (error as {response?:{data?:Record<string,unknown>}})?.response?.data;
  if (!data) return "Não foi possível concluir a operação. Tente novamente.";
  return Object.entries(data).map(([key,value]) => `${key === "detail" ? "" : `${key}: `}${typeof value === "string" ? value : JSON.stringify(value)}`).join(" · ");
}
function Pager({page,total,limit,onPage,busy=false}:{page:number;total:number;limit:number;onPage:(page:number)=>void;busy?:boolean}) {
  return <div className="flex flex-wrap items-center gap-3 py-3 text-sm">
    <Button type="button" variant="outline" disabled={busy || page <= 1} onClick={()=>onPage(page-1)}>Anterior</Button>
    <span>Página {page} de {Math.max(1,Math.ceil(total/limit))} · {total} registro(s)</span>
    <Button type="button" variant="outline" disabled={busy || page*limit >= total} onClick={()=>onPage(page+1)}>Próxima</Button>

  </div>;
}

const defaults={search:"",status:"",priority:"",scope:"",ordering:"recent",page:"1",page_size:"12"};
const metrics:CatalogMetric[]=[{key:"total",title:"Total",hint:"Todos os avisos",icon:<Bell className="h-4 w-4"/>},{key:"draft",title:"Rascunhos",hint:"Em preparação",icon:<Pencil className="h-4 w-4"/>,filter:["status","draft"],accent:"amber"},{key:"scheduled",title:"Agendados",hint:"Publicação futura",icon:<Clock3 className="h-4 w-4"/>,filter:["status","scheduled"],accent:"sky"},{key:"published",title:"Publicados",hint:"Status publicado",icon:<Eye className="h-4 w-4"/>,filter:["status","published"],accent:"emerald"},{key:"closed",title:"Encerrados",hint:"Exibição encerrada",icon:<Archive className="h-4 w-4"/>,filter:["status","closed"],accent:"violet"}];
export default function NotificationsPage() {
  const listing=useAdminListing(defaults,adminNotifications.list);
  const {query,data,loading,change,clear,hasFilters,reload}=listing;
  const items=data?.results||[];
  const permissions:NoticePermissions={can_edit:data?.permissions?.can_edit??false,can_publish:data?.permissions?.can_publish??false,can_track:data?.permissions?.can_track??false};
  const [formOpen,setFormOpen]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const [pendingAction,setPendingAction]=useState<{item:AdminNotificationRow;kind:"publish"|"close"|"archive"}|null>(null);
  const [closeReason,setCloseReason]=useState("");
  const mutation=useRef(false);
  const [form,setForm] = useState(empty);
  const [editing,setEditing] = useState<number|null>(null);
  const [busy,setBusy] = useState(false);
  const [operationError,setMessage] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [options,setOptions] = useState<NoticeOptions>({results:[],plans:[],total:0,page:1,limit:50});
  const [userPage,setUserPage] = useState(1);
  const [userSearch,setUserSearch] = useState("");
  const [userPlan,setUserPlan] = useState("");
  const [userStatus,setUserStatus] = useState("");
  const [usersLoading,setUsersLoading] = useState(false);
  const [tracking,setTracking] = useState<AdminNotificationRow|null>(null);
  const [recipients,setRecipients] = useState<NoticePage<NoticeRecipient>>({results:[],total:0,page:1,limit:50});
  const [recipientPage,setRecipientPage] = useState(1);
  const [recipientState,setRecipientState] = useState("");
  const [recipientSearch,setRecipientSearch] = useState("");
  const [recipientsLoading,setRecipientsLoading] = useState(false);

  useEffect(()=>{
    if (!permissions.can_edit || !formOpen) return;
    let active=true;
    setUsersLoading(true);
    adminNotifications.options(userSearch,userPage,userPlan,userStatus).then(result=>{if(active)setOptions(result);})
      .catch(error=>{if(active)setMessage(errorMessage(error));}).finally(()=>{if(active)setUsersLoading(false);});
    return ()=>{active=false;};
  },[permissions.can_edit,formOpen,userSearch,userPage,userPlan,userStatus]);

  useEffect(()=>{
    if (!tracking) return;
    let active=true;
    setRecipientsLoading(true);
    adminNotifications.recipients(tracking.id,{page:recipientPage,state:recipientState,search:recipientSearch})
      .then(result=>{if(active)setRecipients(result);}).catch(error=>{if(active)setMessage(errorMessage(error));})
      .finally(()=>{if(active)setRecipientsLoading(false);});
    return ()=>{active=false;};
  },[tracking,recipientPage,recipientState,recipientSearch,refresh]);

  const run = useCallback(async (action:()=>Promise<unknown>,success:string)=>{
    if(mutation.current)return false;
    mutation.current=true;setBusy(true);setMessage("");
    try {await action();setNotice(success);setRefresh(value=>value+1);void reload();return true;}
    catch(error){setMessage(errorMessage(error));return false;}
    finally{mutation.current=false;setBusy(false);}
  },[reload]);

  const save = async (event:React.FormEvent) => {
    event.preventDefault();
    await run(async ()=>{
      const payload = {...form, selected_user_ids:form.scope === "selected_users" ? form.selected_user_ids : [],
        starts_at:form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at:form.ends_at ? new Date(form.ends_at).toISOString() : null};
      if(editing) await adminNotifications.update(editing,payload); else await adminNotifications.create(payload);
      setForm(empty); setEditing(null);setFormOpen(false);
    },"Rascunho salvo. Revise o aviso antes de publicar.");
  };
  const edit = (item:AdminNotificationRow)=>{
    setMessage("");setFormOpen(true);
    setEditing(item.id);
    setForm({title:item.title,summary:item.summary,body:item.body,priority:item.priority,scope:item.scope,
      segment_plan_slug:item.segment_plan_slug,segment_subscription_status:item.segment_subscription_status,
      starts_at:inputDate(item.starts_at),ends_at:inputDate(item.ends_at),image_url:item.image_url,video_url:item.video_url,
      links:item.links.map(link=>({...link})),postpone_hours:item.postpone_hours,max_postpones:item.max_postpones,
      selected_user_ids:[...item.selected_user_ids]});

  };
  const toggleVisible = ()=>setForm(current=>{
    const ids=options.results.map(user=>user.id);
    const allSelected=ids.every(id=>current.selected_user_ids.includes(id));
    return {...current,selected_user_ids:allSelected ? current.selected_user_ids.filter(id=>!ids.includes(id)) : [...new Set([...current.selected_user_ids,...ids])]};
  });
  const toggleUser = (id:number)=>setForm(current=>({...current,selected_user_ids:current.selected_user_ids.includes(id) ? current.selected_user_ids.filter(value=>value!==id) : [...current.selected_user_ids,id]}));
  const track = (item:AdminNotificationRow)=>{setTracking(item);setRecipientPage(1);setRecipientState("");setRecipientSearch("");};
  const ask=(item:AdminNotificationRow,kind:"publish"|"close"|"archive")=>{setMessage("");setCloseReason("");setPendingAction({item,kind});};
  const confirm=async()=>{
    if(!pendingAction)return;
    const {item,kind}=pendingAction;
    const done=await run(()=>kind==="publish"?adminNotifications.publish(item.id):kind==="close"?adminNotifications.close(item.id,closeReason):adminNotifications.archive(item.id),kind==="close"?"Aviso encerrado.":kind==="archive"?"Aviso arquivado.":item.starts_at&&new Date(item.starts_at)>new Date()?"Aviso agendado.":"Aviso publicado.");
    if(done)setPendingAction(null);
  };

  return <div className="space-y-6">
    <PageHeader title="Notificações" description="Crie avisos, selecione o público e acompanhe confirmações e adiamentos." actions={permissions.can_edit?<Button onClick={()=>{setForm(empty);setEditing(null);setMessage("");setFormOpen(true);}} className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"><Plus className="h-4 w-4"/>Novo aviso</Button>:undefined}/>
    <FloatingNotice message={notice} onDismiss={()=>setNotice(null)}/>
    {listing.error&&<Notice kind="error">{listing.error}<Button size="sm" variant="ghost" onClick={()=>void listing.reload()}>Tentar novamente</Button></Notice>}
    {operationError&&!formOpen&&!pendingAction&&<Notice kind="error">{operationError}</Notice>}
    <CatalogSummary label="Resumo geral dos avisos" metrics={metrics} overview={data?.overview} query={query} change={change} clear={clear}/>
    <FilterBar active={hasFilters} onClear={clear}><div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="notice-search">Buscar avisos</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input id="notice-search" value={query.search} onChange={event=>change("search",event.target.value)} placeholder="Título ou resumo" className="pl-9"/></div></div><AdminFilterSelect id="notice-status" label="Publicação" value={query.status} options={[["all","Todos os status"],...["draft","scheduled","published","closed","archived"].map(value=>[value,labels[value]] as [string,string])]} onChange={value=>change("status",value)}/><AdminFilterSelect id="notice-priority" label="Tipo" value={query.priority} options={[["all","Todos os tipos"],...["info","maintenance","news","urgent","required"].map(value=>[value,labels[value]] as [string,string])]} onChange={value=>change("priority",value)}/><AdminFilterSelect id="notice-scope" label="Público" value={query.scope} options={[["all","Qualquer público"],["selected_users","Selecionados"],["segment","Segmento"],["all-users","Todos os ativos"]]} onChange={value=>change("scope",value)}/></FilterBar>
    <ListToolbar count={data?.count||0} loading={loading} ordering={query.ordering} onOrderingChange={value=>change("ordering",value)} options={[{value:"recent",label:"Última atualização"},{value:"name",label:"Título (A–Z)"},{value:"created",label:"Mais recentes"}]}/>
    <Dialog open={formOpen} onOpenChange={open=>{if(!busy){setFormOpen(open);if(!open){setEditing(null);setForm(empty);}}}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{editing?"Editar aviso":"Novo aviso"}</DialogTitle><DialogDescription>Salve o rascunho e confira o público antes de publicar.</DialogDescription></DialogHeader>
    {permissions.can_edit && <form onSubmit={event=>void save(event)} className="space-y-5">
      {operationError&&<Notice kind="error">{operationError}</Notice>}
      <h2 className="font-semibold">{editing ? `Editar aviso #${editing}` : "Novo aviso"}</h2>
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">Título<Input required maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
        <AdminFilterSelect id="notice-form-type" label="Tipo" value={form.priority} options={["info","maintenance","news","urgent","required"].map(value=>[value,labels[value]] as [string,string])} disabled={busy} onChange={value=>setForm({...form,priority:value})}/>

        <label className="space-y-1 text-sm md:col-span-2">Resumo<Input maxLength={280} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/></label>
        <label className="space-y-1 text-sm md:col-span-2">Corpo do aviso<textarea className="block min-h-28 w-full rounded border bg-transparent p-3" value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/><span className="text-xs text-slate-500">Texto simples, com quebras de linha. Use os campos abaixo para mídia e links.</span></label>
        <label className="space-y-1 text-sm">Imagem (URL HTTP/HTTPS)<Input type="url" maxLength={200} value={form.image_url} onChange={e=>setForm({...form,image_url:e.target.value})}/></label>
        <label className="space-y-1 text-sm">Vídeo (YouTube ou Vimeo)<Input type="url" maxLength={200} value={form.video_url} onChange={e=>setForm({...form,video_url:e.target.value})}/></label>
        <label className="space-y-1 text-sm">Início (horário local)<Input type="datetime-local" value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})}/></label>
        <label className="space-y-1 text-sm">Término (horário local)<Input type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})}/></label>
        <label className="space-y-1 text-sm">Intervalo de adiamento (horas)<Input type="number" required min={1} max={8760} value={form.postpone_hours} onChange={e=>setForm({...form,postpone_hours:Number(e.target.value)})}/></label>
        <label className="space-y-1 text-sm">Máximo de adiamentos<Input type="number" required min={0} max={100} value={form.max_postpones} onChange={e=>setForm({...form,max_postpones:Number(e.target.value)})}/></label>
        <div className="space-y-2 md:col-span-2"><h3 className="font-medium">Links ({form.links.length}/10)</h3>
          {form.links.map((link,index)=><div key={index} className="flex flex-wrap gap-2">
            <Input className="min-w-40 flex-1" aria-label={`Texto do link ${index+1}`} required maxLength={160} placeholder="Texto do link" value={link.label} onChange={e=>setForm({...form,links:form.links.map((value,i)=>i===index?{...value,label:e.target.value}:value)})}/>
            <Input className="min-w-48 flex-1" aria-label={`URL do link ${index+1}`} type="url" required placeholder="https://" value={link.url} onChange={e=>setForm({...form,links:form.links.map((value,i)=>i===index?{...value,url:e.target.value}:value)})}/>
            <Button type="button" variant="outline" onClick={()=>setForm({...form,links:form.links.filter((_,i)=>i!==index)})}>Remover link {index+1}</Button>
          </div>)}
          <Button type="button" variant="outline" disabled={form.links.length>=10} onClick={()=>setForm({...form,links:[...form.links,{label:"",url:""}]})}>Adicionar link</Button>
        </div>
        <div className="md:col-span-2"><AdminFilterSelect id="notice-form-scope" label="Público" value={form.scope==="all"?"all-users":form.scope} options={[["selected_users","Usuários selecionados"],["all-users","Todos os usuários ativos"],["segment","Segmento de assinatura"]]} disabled={busy} onChange={value=>setForm({...form,scope:value==="all-users"?"all":value})}/></div>

      </fieldset>
      {form.scope === "segment" && <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Plano<select className={`${selectClass} block w-full`} value={form.segment_plan_slug} onChange={e=>setForm({...form,segment_plan_slug:e.target.value})}><option value="">Todos os planos</option>{options.plans.map(plan=><option key={plan.slug} value={plan.slug}>{plan.name}</option>)}</select></label>
        <label className="text-sm">Status da assinatura<select className={`${selectClass} block w-full`} value={form.segment_subscription_status} onChange={e=>setForm({...form,segment_subscription_status:e.target.value})}><option value="">Todos os status</option>{Object.entries(subscriptionStatuses).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
        <p className="text-xs text-slate-500 md:col-span-2">Informe ao menos um critério. O público ativo será processado em segundo plano após a publicação.</p>
      </div>}
      {form.scope === "selected_users" && <section className="space-y-3 rounded border p-3" aria-label="Seleção de destinatários">
        <h3 className="font-medium">Destinatários selecionados ({form.selected_user_ids.length})</h3>
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-48 flex-1" aria-label="Buscar destinatário" placeholder="Nome ou e-mail" value={userSearch} onChange={e=>{setUserSearch(e.target.value);setUserPage(1);}}/>
          <select aria-label="Filtrar destinatários por plano" className={selectClass} value={userPlan} onChange={e=>{setUserPlan(e.target.value);setUserPage(1);}}><option value="">Todos os planos</option>{options.plans.map(plan=><option key={plan.slug} value={plan.slug}>{plan.name}</option>)}</select>
          <select aria-label="Filtrar destinatários por assinatura" className={selectClass} value={userStatus} onChange={e=>{setUserStatus(e.target.value);setUserPage(1);}}><option value="">Todos os status</option>{Object.entries(subscriptionStatuses).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select>
        </div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={toggleVisible} disabled={usersLoading || !options.results.length}>Selecionar/desmarcar página</Button><Button type="button" variant="outline" onClick={()=>setForm({...form,selected_user_ids:[]})}>Limpar seleção</Button></div>
        {usersLoading ? <p role="status">Buscando usuários…</p> : <div className="max-h-64 space-y-2 overflow-y-auto">{options.results.map(user=><label key={user.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.selected_user_ids.includes(user.id)} onChange={()=>toggleUser(user.id)}/><span>{user.username} · {user.email}</span></label>)}{!options.results.length && <p>Nenhum usuário ativo encontrado.</p>}</div>}
        <Pager page={userPage} total={options.total} limit={options.limit} onPage={setUserPage} busy={usersLoading}/>
        <p className="text-xs text-slate-500">A seleção é mantida ao trocar de página ou filtro. Apenas usuários ativos podem receber o aviso.</p>
      </section>}
      {form.scope === "all" && <p className="text-sm">Os usuários ativos serão processados em lotes pelo worker após a publicação.</p>}
      <section className="space-y-3 rounded-lg border bg-slate-50 p-4 dark:bg-slate-900" aria-label="Prévia do aviso">
        <h3 className="font-semibold">Prévia · {labels[form.priority]}</h3><h4 className="text-lg font-semibold">{form.title || "Título do aviso"}</h4>
        {form.summary && <p className="text-sm text-slate-500">{form.summary}</p>}
        <NoticeContent {...form}/>
        <p className="text-xs text-slate-500">Público: {form.scope === "all" ? "todos os usuários ativos" : form.scope === "segment" ? `segmento ${form.segment_plan_slug || "todos os planos"} / ${subscriptionStatuses[form.segment_subscription_status as keyof typeof subscriptionStatuses] || "todos os status"}` : `${form.selected_user_ids.length} usuário(s) selecionado(s)`}. Adiamento: {form.postpone_hours}h, até {form.max_postpones} vez(es).</p>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled>Ver mais tarde</Button><Button type="button" disabled>Confirmar visualização</Button></div>
      </section>
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar rascunho"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setEditing(null);setForm(empty);setFormOpen(false);}}>Cancelar</Button></div>
    </form>}</DialogContent></Dialog>

    <section className="space-y-3" aria-label="Avisos criados">
      {loading ? <LoadingState label="Carregando avisos..."/> : <Card className="min-w-0 overflow-hidden"><div className="overflow-x-auto"><table aria-label="Lista de avisos" className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50 dark:bg-slate-800/50"><tr className="border-b text-left"><th className="p-3">Aviso / período</th><th>Status</th><th>Público</th><th>Confirmações</th><th>Adiados / pendentes</th><th className="p-3">Ações</th></tr></thead><tbody>
        {items.map(item=><tr key={item.id} className="border-b"><td className="p-3"><strong>{item.title}</strong><p>{labels[item.priority]}</p><p className="text-xs text-slate-500">{formatDate(item.starts_at)} até {formatDate(item.ends_at)}</p></td><td>{labels[item.status]}</td><td>{item.metrics.total}{item.status === "published" && item.scope !== "selected_users" && !item.recipients_materialized_at && <p className="text-xs">Processamento pendente</p>}</td><td>{item.metrics.viewed} ({item.metrics.total ? Math.round(100*item.metrics.viewed/item.metrics.total) : 0}%)</td><td>{item.metrics.postponed} / {item.metrics.pending}</td><td className="p-3"><div className="flex flex-wrap gap-3">
          {permissions.can_edit && ["draft","scheduled"].includes(item.status) && <button disabled={busy} className="rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800" onClick={()=>edit(item)}>Editar</button>}
          {permissions.can_publish && ["draft","scheduled"].includes(item.status) && <button disabled={busy} className="rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800" onClick={()=>ask(item,"publish")}>Publicar/agendar</button>}
          {permissions.can_publish && ["published","scheduled"].includes(item.status) && <button disabled={busy} className="rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800" onClick={()=>ask(item,"close")}>Encerrar</button>}
          {permissions.can_publish && ["draft","scheduled","closed"].includes(item.status) && <button disabled={busy} className="rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800" onClick={()=>ask(item,"archive")}>Arquivar</button>}
          {permissions.can_track && <button className="rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800" onClick={()=>track(item)}>Destinatários</button>}
        </div></td></tr>)}
        {!listing.error&&!items.length&&<tr><td colSpan={6}><EmptyState title={hasFilters?"Nenhum aviso corresponde aos filtros":"Nenhum aviso cadastrado"} description={hasFilters?"Ajuste a busca ou limpe os filtros.":"Comece com um rascunho."}/>{hasFilters&&<div className="flex justify-center pb-6"><Button variant="outline" onClick={clear}>Limpar filtros</Button></div>}</td></tr>}
      </tbody></table></div></Card>}
      <ListPagination count={data?.count||0} page={Number(query.page)} pageSize={Number(query.page_size)} disabled={loading} onPageChange={value=>change("page",String(value))} onPageSizeChange={value=>change("page_size",String(value))}/>
    </section>

    {tracking && <section className="space-y-3 rounded-xl border p-4" aria-label="Acompanhamento individual">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Destinatários · {tracking.title}</h2><Button variant="outline" onClick={()=>setTracking(null)}>Fechar acompanhamento</Button></div>
      <div className="flex flex-wrap gap-2"><Input className="max-w-sm" aria-label="Buscar no acompanhamento" placeholder="Nome ou e-mail" value={recipientSearch} onChange={e=>{setRecipientSearch(e.target.value);setRecipientPage(1);}}/><select aria-label="Filtrar estado do destinatário" className={selectClass} value={recipientState} onChange={e=>{setRecipientState(e.target.value);setRecipientPage(1);}}><option value="">Todos os estados</option>{["pending","viewed","postponed","dismissed"].map(value=><option key={value} value={value}>{labels[value]}</option>)}</select><Button variant="outline" onClick={()=>setRefresh(value=>value+1)} disabled={recipientsLoading}>Atualizar acompanhamento</Button></div>
      {recipientsLoading ? <p role="status">Carregando destinatários…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Usuário</th><th>Estado</th><th>Primeira exibição</th><th>Confirmação</th><th>Próximo lembrete</th><th>Adiamentos</th></tr></thead><tbody>{recipients.results.map(row=><tr key={row.id} className="border-b"><td className="p-2">{row.username}<p className="text-xs text-slate-500">{row.email}</p></td><td>{labels[row.state]}</td><td>{formatDate(row.first_shown_at)}</td><td>{formatDate(row.confirmed_at)}</td><td>{formatDate(row.next_reminder_at)}</td><td>{row.postpone_count}</td></tr>)}{!recipients.results.length && <tr><td colSpan={6} className="p-4">Nenhum destinatário encontrado. Públicos amplos podem estar aguardando o worker.</td></tr>}</tbody></table></div>}
      <Pager page={recipientPage} total={recipients.total} limit={recipients.limit} onPage={setRecipientPage} busy={recipientsLoading}/>
    </section>}
    <Dialog open={!!pendingAction} onOpenChange={open=>{if(!open&&!busy)setPendingAction(null);}}><DialogContent><DialogHeader><DialogTitle>{pendingAction?.kind==="publish"?"Publicar ou agendar aviso":pendingAction?.kind==="close"?"Encerrar aviso":"Arquivar aviso"}</DialogTitle><DialogDescription>{pendingAction?.item.title}. {pendingAction?.kind==="publish"?"Confira o público e o período: publicar torna o aviso elegível à entrega. Um início futuro mantém o agendamento.":"O histórico de destinatários será preservado."}</DialogDescription></DialogHeader>{operationError&&<Notice kind="error">{operationError}</Notice>}{pendingAction?.kind==="publish"&&<p className="text-sm">Público: {pendingAction.item.scope==="all"?"todos os usuários ativos":pendingAction.item.scope==="segment"?`segmento ${pendingAction.item.segment_plan_slug||"todos os planos"} / ${pendingAction.item.segment_subscription_status||"todos os status"}`:`${pendingAction.item.selected_user_ids.length} usuário(s) selecionado(s)`}</p>}{pendingAction?.kind==="close"&&<div className="space-y-2"><Label htmlFor="notice-close-reason">Motivo do encerramento{pendingAction.item.priority==="required"?" *":" (opcional)"}</Label><Input id="notice-close-reason" value={closeReason} onChange={event=>setCloseReason(event.target.value)} disabled={busy}/></div>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setPendingAction(null)}>Cancelar</Button><Button disabled={busy||Boolean(pendingAction?.kind==="close"&&pendingAction.item.priority==="required"&&!closeReason.trim())} onClick={()=>void confirm()}>{busy?"Aguarde...":"Confirmar"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
