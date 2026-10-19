"use client";

import { FormEvent, useRef, useState } from "react";
import { Pencil, Plus, Star, Search, Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { bancasAdmin, BancaCatalogRow } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useAdminListing, adminError } from "@/components/admin/useAdminListing";
import { FilterBar, ListToolbar, ListPagination, AdminFilterSelect } from "@/components/admin/ListControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const defaults = {search: "", active: "", featured: "", ordering: "name", page: "1", page_size: "12"};
type Editor = Partial<BancaCatalogRow>;
export default function BancasPage() {
  const listing = useAdminListing(defaults, bancasAdmin.list);
  const {query, data, loading, error, change, clear, hasFilters, forbidden} = listing;
  const canManage = data?.can_manage === true && !forbidden;
  const [editing, setEditing] = useState<Editor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mutation = useRef(false);
  const open = (row?: BancaCatalogRow) => { setFormError(null); setEditing(row || {name: "", slug: "", is_active: true, is_featured: false}); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || mutation.current) return;
    mutation.current = true; setSaving(true); setFormError(null);
    const form = new FormData(event.currentTarget);
    const payload = {name: String(form.get("name")).trim(), slug: String(form.get("slug")).trim(), official_url: String(form.get("official_url")).trim(), description: String(form.get("description")).trim(), alias: String(form.get("alias")).trim(), is_active: form.get("is_active") === "on", is_featured: form.get("is_featured") === "on"};
    try {
      if (editing.id) await bancasAdmin.update(editing.id, payload);
      else await bancasAdmin.create(payload);
      setNotice(editing.id ? "Banca atualizada." : "Banca cadastrada."); setEditing(null); void listing.reload();
    } catch (err) { setFormError(adminError(err, "Não foi possível salvar a banca.")); }
    finally { mutation.current = false; setSaving(false); }
  };
  return <div className="space-y-6">
    <PageHeader title="Bancas" description="Organize o catálogo, as grafias alternativas e a disponibilidade para novos cadastros." actions={canManage ? <Button onClick={() => open()} className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"><Plus className="h-4 w-4" />Nova banca</Button> : undefined} />
    <FloatingNotice message={notice} onDismiss={() => setNotice(null)} />
    {error && <Notice kind="error">{error}{!forbidden && <Button size="sm" variant="ghost" onClick={() => void listing.reload()}>Tentar novamente</Button>}</Notice>}
    {!forbidden && <>
    <section aria-label="Resumo geral das bancas" className="space-y-2"><p className="text-xs text-slate-500">Visão geral de todo o catálogo · independente dos filtros da lista</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <button type="button" aria-label="Mostrar todas as bancas" className="rounded-xl text-left [&>div]:h-full" onClick={clear}><StatCard title="Total de bancas" value={data?.overview.total ?? "—"} hint="Todo o catálogo" icon={<Building2 className="h-4 w-4" />} /></button>
      <button type="button" aria-label="Filtrar bancas ativas" aria-pressed={query.active === "1"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 [&>div]:h-full" onClick={() => change("active", query.active === "1" ? "" : "1")}><StatCard title="Ativas" value={data?.overview.active ?? "—"} hint="Disponíveis para novos cadastros" icon={<CheckCircle2 className="h-4 w-4" />} accent="emerald" /></button>
      <button type="button" aria-label="Filtrar bancas inativas" aria-pressed={query.active === "0"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 [&>div]:h-full" onClick={() => change("active", query.active === "0" ? "" : "0")}><StatCard title="Inativas" value={data?.overview.inactive ?? "—"} hint="Histórico preservado" icon={<XCircle className="h-4 w-4" />} accent="rose" /></button>
      <button type="button" aria-label="Filtrar bancas em destaque" aria-pressed={query.featured === "1"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 [&>div]:h-full" onClick={() => change("featured", query.featured === "1" ? "" : "1")}><StatCard title="Em destaque" value={data?.overview.featured ?? "—"} hint="Bancas destacadas no catálogo" icon={<Star className="h-4 w-4" />} accent="amber" /></button>
    </div></section>
    <FilterBar active={hasFilters} onClear={clear}><div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="banca-search">Buscar bancas</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="banca-search" value={query.search} onChange={event => change("search", event.target.value)} placeholder="Nome, slug ou grafia alternativa" className="pl-9" /></div></div><AdminFilterSelect id="banca-active" label="Disponibilidade" value={query.active} options={[["all", "Todas as bancas"], ["1", "Ativas"], ["0", "Inativas"]]} onChange={value => change("active", value)} /><AdminFilterSelect id="banca-featured" label="Destaque" value={query.featured} options={[["all", "Qualquer destaque"], ["1", "Em destaque"], ["0", "Sem destaque"]]} onChange={value => change("featured", value)} /></FilterBar>
    <ListToolbar count={data?.count || 0} loading={loading} ordering={query.ordering} onOrderingChange={value => change("ordering", value)} options={[{value: "name", label: "Nome (A–Z)"}, {value: "-name", label: "Nome (Z–A)"}, {value: "recent", label: "Mais recentes"}]} />
    <Card className="min-w-0 overflow-hidden"><Table aria-label="Lista de bancas" className="min-w-[720px]"><TableHeader className="bg-slate-50 dark:bg-slate-800/50"><TableRow><TableHead>Banca</TableHead><TableHead>Grafias alternativas</TableHead><TableHead>Uso do nome canônico</TableHead><TableHead>Status</TableHead>{canManage && <TableHead className="text-right">Ações</TableHead>}</TableRow></TableHeader><TableBody>
      {loading && <TableRow><TableCell colSpan={5}><LoadingState label="Carregando bancas..." /></TableCell></TableRow>}
      {!loading && !error && !data?.results.length && <TableRow><TableCell colSpan={5}><EmptyState title={hasFilters ? "Nenhuma banca corresponde aos filtros" : "Nenhuma banca cadastrada"} description={hasFilters ? "Ajuste a busca ou limpe os filtros." : "Cadastre a primeira banca para organizar o catálogo."} /><div className="flex justify-center pb-6">{hasFilters ? <Button variant="outline" onClick={clear}>Limpar filtros</Button> : canManage && <Button variant="outline" onClick={() => open()}>Nova banca</Button>}</div></TableCell></TableRow>}
      {!loading && !error && data?.results.map(row => <TableRow key={row.id}><TableCell><div className="flex items-center gap-2">{canManage ? <button type="button" className="text-left font-medium hover:underline" onClick={() => open(row)}>{row.name}</button> : <span className="font-medium">{row.name}</span>}{row.is_featured && <Star className="h-3.5 w-3.5 text-amber-500" aria-label="Em destaque" />}</div><p className="text-xs text-slate-500">/{row.slug}</p></TableCell><TableCell className="max-w-64 whitespace-normal">{row.aliases.map(alias => alias.alias).join(", ") || "Nenhuma"}</TableCell><TableCell><p>{row.questions_count} questões</p><p className="text-xs text-slate-500">{row.exams_count} provas · {row.concursos_count ?? 0} concursos</p></TableCell><TableCell><StatusBadge status={row.is_active ? "active" : "inactive"} /></TableCell>{canManage && <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => open(row)} aria-label={`Editar banca ${row.name}`}><Pencil className="h-3.5 w-3.5" />Editar</Button></TableCell>}</TableRow>)}
    </TableBody></Table></Card>
    <ListPagination count={data?.count || 0} page={Number(query.page)} pageSize={Number(query.page_size)} disabled={loading} onPageChange={value => change("page", String(value))} onPageSizeChange={value => change("page_size", String(value))} />
    </>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !saving) setEditing(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing?.id ? "Editar banca" : "Nova banca"}</DialogTitle><DialogDescription>Atualize o catálogo sem reescrever o histórico de provas e questões.</DialogDescription></DialogHeader>{editing && <form key={editing.id || "new"} onSubmit={save} className="space-y-4">{formError && <Notice kind="error">{formError}</Notice>}<fieldset disabled={saving} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="banca-name">Nome canônico *</Label><Input id="banca-name" name="name" required defaultValue={editing.name} /></div><div className="space-y-2"><Label htmlFor="banca-slug">Slug *</Label><Input id="banca-slug" name="slug" required defaultValue={editing.slug} pattern="[a-zA-Z0-9_-]+" /></div></div><div className="space-y-2"><Label htmlFor="banca-url">Site oficial</Label><Input id="banca-url" name="official_url" type="url" defaultValue={editing.official_url} placeholder="https://" /></div><div className="space-y-2"><Label htmlFor="banca-alias">Adicionar grafia alternativa</Label><Input id="banca-alias" name="alias" placeholder="Sigla ou outra grafia (opcional)" />{editing.aliases?.length ? <p className="text-xs text-slate-500">Atuais: {editing.aliases.map(alias => alias.alias).join(", ")}</p> : null}</div><div className="space-y-2"><Label htmlFor="banca-description">Descrição editorial</Label><Textarea id="banca-description" name="description" defaultValue={editing.description} /></div><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input name="is_active" type="checkbox" defaultChecked={editing.is_active} />Ativa para novos cadastros</label><label className="flex items-center gap-2 text-sm"><input name="is_featured" type="checkbox" defaultChecked={editing.is_featured} />Destacar</label></div></fieldset><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Salvar banca</Button></DialogFooter></form>}</DialogContent></Dialog>
  </div>;
}
