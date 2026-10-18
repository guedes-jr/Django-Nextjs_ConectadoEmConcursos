"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Pencil, Loader2, AlertCircle, CircleDollarSign, Clock3, Users, UserPlus } from "lucide-react";
import { backoffice, SubscriptionRow, Plan, formatDate, cycleLabel } from "@/lib/backoffice";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { PageHeader } from "@/components/admin/PageHeader";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { StatCard } from "@/components/admin/StatCard";
import { FilterBar, ListToolbar, ListPagination } from "@/components/admin/ListControls";

type Filters = { search: string; status: string; plan: string; cycle: string; expiry: string; ordering: string; page: number; page_size: number };
const defaults: Filters = { search: "", status: "", plan: "", cycle: "", expiry: "", ordering: "-created_at", page: 1, page_size: 12 };
const statuses: [string, string][] = [["all", "Todos os status"], ["valid", "Vigentes"], ["active", "Status ativo"], ["pending_payment", "Pagamento pendente"], ["canceled", "Canceladas"]];
type Summary = Awaited<ReturnType<typeof backoffice.subscriptionsOverview>>;
function message(error: unknown, fallback: string) {
  const data = (error as {response?: {data?: Record<string, unknown>}})?.response?.data;
  return data && typeof data === "object" ? Object.entries(data).map(([key, value]) => `${key === "detail" ? "" : `${key}: `}${Array.isArray(value) ? value.join(" ") : value}`).join(" · ") || fallback : fallback;
}
function FilterSelect({id, label, value, options, onChange}: {id: string; label: string; value: string; options: [string, string][]; onChange: (value: string) => void}) {
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label><Select value={value || "all"} onValueChange={next => onChange(next === "all" ? "" : next)}><SelectTrigger id={id} className="w-full xl:w-44"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}

export default function AdminSubscriptionsPage() {
  const [filters, setFilters] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0);
  const saving = useRef(false);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const [form, setForm] = useState({plan_slug: "", cycle: "mensal", status: "active"});
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const choice = (key: string, allowed: string[], fallback = "") => allowed.includes(params.get(key) || "") ? params.get(key)! : fallback;
      const page = Number(params.get("page"));
      setFilters({search: params.get("search") || "", status: choice("status", statuses.map(([key]) => key).filter(key => key !== "all")), plan: params.get("plan") || "", cycle: choice("cycle", Object.keys(cycleLabel)), expiry: choice("expiry", ["30", "expired"]), ordering: choice("ordering", ["created_at", "name", "expires"], "-created_at"), page: Number.isSafeInteger(page) && page > 0 ? page : 1, page_size: [12,24,48].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 12});
      setReady(true);
    };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const loadSummary = useCallback(async () => {
    try { setSummary(await backoffice.subscriptionsOverview()); setSummaryError(false); }
    catch { setSummaryError(true); }
  }, []);
  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try { setPlans((await backoffice.listPlans()).results); setPlansError(false); }
    catch { setPlansError(true); }
    finally { setPlansLoading(false); }
  }, []);
  useEffect(() => { void loadSummary(); void loadPlans(); }, [loadSummary, loadPlans]);
  const loadRows = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const result = await backoffice.listSubscriptions({search: filters.search, status: filters.status, plan: filters.plan, cycle: filters.cycle, expires_within: filters.expiry === "30" ? 30 : undefined, expired: filters.expiry === "expired" ? true : undefined, page: filters.page, page_size: filters.page_size, ordering: filters.ordering});
      if (id !== sequence.current) return;
      setRows(result.results); setCount(result.count);
      if (result.page !== filters.page) setFilters(current => ({...current, page: result.page}));
    } catch (err) { if (id === sequence.current) setError(message(err, "Não foi possível carregar as assinaturas.")); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [filters]);
  useEffect(() => {
    if (!ready) return;
    const ref = sequence;
    ++ref.current; setLoading(true);
    const params = new URLSearchParams(window.location.search);
    Object.entries(filters).forEach(([key, value]) => value === defaults[key as keyof Filters] ? params.delete(key) : params.set(key, String(value)));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    const timer = window.setTimeout(() => void loadRows(), 300);
    return () => { window.clearTimeout(timer); ++ref.current; };
  }, [ready, filters, loadRows]);
  const change = (key: keyof Filters, value: string | number) => setFilters(current => ({...current, [key]: value, page: 1}));
  const clear = () => setFilters(current => ({...defaults, ordering: current.ordering, page_size: current.page_size}));
  const hasFilters = Boolean(filters.search || filters.status || filters.plan || filters.cycle || filters.expiry);
  const statusCard = (value: string) => setFilters(current => ({...current, status: current.status === value ? "" : value, expiry: "", page: 1}));
  const openEdit = (sub: SubscriptionRow) => { setEditing(sub); setForm({plan_slug: sub.plan_slug, cycle: sub.cycle, status: sub.status}); setEditError(null); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || saving.current) return;
    saving.current = true; setBusy(true); setEditError(null);
    try { await backoffice.updateSubscription(editing.id, form); setEditing(null); setNotice("Assinatura atualizada."); void loadRows(); void loadSummary(); }
    catch (err) { setEditError(message(err, "Não foi possível atualizar a assinatura.")); }
    finally { saving.current = false; setBusy(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="Assinaturas" description="Acompanhe a vigência, os pagamentos pendentes e os vencimentos dos alunos." actions={<Button asChild className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"><Link href="/admin/usuarios"><UserPlus className="h-4 w-4" /> Atribuir a um usuário</Link></Button>} />
    <FloatingNotice message={notice} onDismiss={() => setNotice(null)} />
    {summaryError && <Notice kind="error">Não foi possível atualizar os indicadores. <Button variant="ghost" size="sm" onClick={() => void loadSummary()}>Tentar novamente</Button></Notice>}
    <section aria-label="Resumo geral das assinaturas" className="space-y-2"><p className="text-xs text-slate-500">Visão geral de todas as assinaturas · independente dos filtros da lista</p><div className={`grid gap-3 sm:grid-cols-2 ${summary?.mrr_estimated != null ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
      <button type="button" aria-label="Filtrar assinaturas vigentes" aria-pressed={filters.status === "valid"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" onClick={() => statusCard("valid")}><StatCard title="Vigentes" value={summary?.active ?? "—"} hint="Ativas e dentro da validade" icon={<Users className="h-4 w-4" />} accent="emerald" /></button>
      <button type="button" aria-label="Filtrar pagamentos pendentes" aria-pressed={filters.status === "pending_payment"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" onClick={() => statusCard("pending_payment")}><StatCard title="Pendentes" value={summary?.pending ?? "—"} hint="Aguardando pagamento" icon={<AlertCircle className="h-4 w-4" />} accent="amber" /></button>
      <button type="button" aria-label="Filtrar assinaturas canceladas" aria-pressed={filters.status === "canceled"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" onClick={() => statusCard("canceled")}><StatCard title="Canceladas" value={summary?.canceled ?? "—"} hint="Status cancelado" icon={<AlertCircle className="h-4 w-4" />} accent="rose" /></button>
      <button type="button" aria-label="Filtrar vencimentos em 30 dias" aria-pressed={filters.expiry === "30"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" onClick={() => setFilters(current => ({...current, expiry: current.expiry === "30" ? "" : "30", status: "", page: 1}))}><StatCard title="Vencem em 30 dias" value={summary?.expiring_30_days ?? "—"} hint="Somente assinaturas vigentes" icon={<Clock3 className="h-4 w-4" />} accent="sky" /></button>
      {summary?.mrr_estimated != null && <StatCard title="MRR estimado" value={new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"}).format(Number(summary.mrr_estimated))} hint="BRL; preço contratado quando disponível" icon={<CircleDollarSign className="h-4 w-4" />} accent="violet" />}
    </div></section>
    <FilterBar active={hasFilters} onClear={clear}>
      <div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="subscription-search">Buscar assinaturas</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="subscription-search" value={filters.search} onChange={event => change("search", event.target.value)} placeholder="Nome, usuário ou e-mail" className="pl-9" /></div></div>
      <FilterSelect id="subscription-status" label="Status" value={filters.status} options={statuses} onChange={value => change("status", value)} />
      <FilterSelect id="subscription-plan" label="Plano" value={filters.plan} options={[["all", "Todos os planos"], ...plans.map(plan => [plan.slug, plan.name] as [string, string]), ...(filters.plan && !plans.some(plan => plan.slug === filters.plan) ? [[filters.plan, filters.plan] as [string, string]] : [])]} onChange={value => change("plan", value)} />
      <FilterSelect id="subscription-cycle" label="Ciclo" value={filters.cycle} options={[["all", "Todos os ciclos"], ...Object.entries(cycleLabel)]} onChange={value => change("cycle", value)} />
      <FilterSelect id="subscription-expiry" label="Vencimento" value={filters.expiry} options={[["all", "Qualquer vencimento"], ["30", "Nos próximos 30 dias"], ["expired", "Vencidas com status ativo"]]} onChange={value => change("expiry", value)} />
    </FilterBar>
    {plansError && <Notice kind="error">Não foi possível carregar o catálogo de planos. <Button size="sm" variant="ghost" onClick={() => void loadPlans()}>Recarregar planos</Button></Notice>}
    <ListToolbar count={count} loading={loading} ordering={filters.ordering} onOrderingChange={value => change("ordering", value)} options={[{value: "-created_at", label: "Mais recentes"}, {value: "created_at", label: "Mais antigas"}, {value: "name", label: "Usuário (A–Z)"}, {value: "expires", label: "Vencimento próximo"}]} />
    {error && <Notice kind="error">{error} <Button variant="ghost" size="sm" onClick={() => void loadRows()}>Tentar novamente</Button></Notice>}
    <Card className="min-w-0 overflow-hidden"><Table aria-label="Lista de assinaturas"><TableHeader className="bg-slate-50 dark:bg-slate-800/50"><TableRow><TableHead>Usuário</TableHead><TableHead>Plano / ciclo</TableHead><TableHead>Status</TableHead><TableHead>Vencimento</TableHead><TableHead>Origem</TableHead><TableHead>Criada em</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
      {loading && <TableRow><TableCell colSpan={7}><LoadingState label="Carregando assinaturas..." /></TableCell></TableRow>}
      {!loading && !error && rows.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState title={hasFilters ? "Nenhuma assinatura corresponde aos filtros" : "Nenhuma assinatura cadastrada"} description={hasFilters ? "Ajuste a busca ou limpe os filtros." : "Escolha um usuário para atribuir seu primeiro plano."} /><div className="flex justify-center pb-6">{hasFilters ? <Button variant="outline" onClick={clear}>Limpar filtros</Button> : <Button asChild variant="outline"><Link href="/admin/usuarios">Escolher usuário</Link></Button>}</div></TableCell></TableRow>}
      {!loading && !error && rows.map(sub => <TableRow key={sub.id}><TableCell><Link href={`/admin/usuarios/${sub.user_id}`} className="font-medium hover:underline">{sub.username}</Link><p className="text-xs text-slate-500">{sub.email || "Sem e-mail"}</p></TableCell><TableCell><p>{sub.plan_name}</p><span className="text-xs text-slate-500">{cycleLabel[sub.cycle] || sub.cycle}</span></TableCell><TableCell><StatusBadge status={sub.status} />{sub.status === "active" && sub.current_period_end && new Date(sub.current_period_end).getTime() <= Date.now() && <p className="mt-1 text-xs text-rose-600">Prazo vencido</p>}</TableCell><TableCell className="whitespace-nowrap text-slate-500">{sub.current_period_end ? formatDate(sub.current_period_end) : "Sem vencimento definido"}</TableCell><TableCell>{sub.gateway === "stripe" ? "Stripe" : "Local"}</TableCell><TableCell className="whitespace-nowrap text-slate-500">{formatDate(sub.created_at)}</TableCell><TableCell className="text-right">{sub.gateway === "stripe" ? <span className="text-xs text-slate-500">Gerenciada pelo provedor</span> : <Button size="sm" variant="outline" onClick={() => openEdit(sub)} aria-label={`Editar assinatura de ${sub.username}`}><Pencil className="h-3.5 w-3.5" />Editar</Button>}</TableCell></TableRow>)}
    </TableBody></Table></Card>
    <ListPagination count={count} page={filters.page} pageSize={filters.page_size} disabled={loading} onPageChange={page => setFilters(current => ({...current, page}))} onPageSizeChange={value => change("page_size", value)} />
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Editar assinatura</DialogTitle><DialogDescription>{editing?.username} · {editing?.plan_name}. Alterações locais não geram cobranças no provedor.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">{editError && <Notice kind="error">{editError}</Notice>}{plansLoading ? <LoadingState label="Carregando planos..." /> : <><FilterSelect id="edit-subscription-plan" label="Plano" value={form.plan_slug} options={plans.map(plan => [plan.slug, plan.name])} onChange={value => setForm(current => ({...current, plan_slug: value}))} /><FilterSelect id="edit-subscription-cycle" label="Ciclo" value={form.cycle} options={Object.entries(cycleLabel)} onChange={value => setForm(current => ({...current, cycle: value}))} /><FilterSelect id="edit-subscription-status" label="Status" value={form.status} options={statuses.filter(([key]) => !["all", "valid"].includes(key))} onChange={value => setForm(current => ({...current, status: value}))} /></>}<DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || plansLoading || plansError || !plans.some(plan => plan.slug === form.plan_slug)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Salvar assinatura</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
