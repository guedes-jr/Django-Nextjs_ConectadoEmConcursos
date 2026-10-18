"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Copy, Eye, Loader2, Package, Pencil, Plus, Search, Sparkles, Trash2, Users, WalletCards } from "lucide-react";
import { backoffice, Plan, PlanPayload, PlansOverview } from "@/lib/backoffice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { StatCard } from "@/components/admin/StatCard";
import { FilterBar, ListToolbar, ListPagination } from "@/components/admin/ListControls";
import { PageHeader } from "@/components/admin/PageHeader";

type PlanForm = { name: string; slug: string; description: string; monthly_price: string; semiannual_price: string; annual_price: string; features: string; status: Plan["status"]; is_highlighted: boolean; trial_days: string; is_active: boolean; sort_order: string };
const emptyForm: PlanForm = { name: "", slug: "", description: "", monthly_price: "", semiannual_price: "", annual_price: "", features: "", status: "draft", is_highlighted: false, trial_days: "0", is_active: false, sort_order: "0" };
const statusLabels = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" };

function formatMoney(value: string | number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)); }
function formatPrice(value: string | number | null | undefined) { const n = Number(value ?? 0); return n === 0 ? "Grátis" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n).replace(/\u00a0/g, " "); }
function metricsFor(overview: PlansOverview | null, id: number) { return overview?.plans.find((item) => item.id === id); }

export default function AdminPlansPage() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [overview, setOverview] = useState<PlansOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [priceMax, setPriceMax] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [count, setCount] = useState(0);
  const [ordering, setOrdering] = useState("default");
  const [ready, setReady] = useState(false);
  const requestId = useRef(0);
  const [summaryError, setSummaryError] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [preview, setPreview] = useState<Plan | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<Plan | null>(null);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("q") || "");
      setStatusFilter(["draft", "published", "archived"].includes(params.get("status") || "") ? params.get("status")! : "all");
      setActiveFilter(["active", "inactive"].includes(params.get("active") || "") ? params.get("active")! : "all");
      const price = params.get("price_max") || "";
      setPriceMax(price && Number.isFinite(Number(price)) && Number(price) >= 0 ? price : "");
      setOrdering(["name", "price", "-price"].includes(params.get("ordering") || "") ? params.get("ordering")! : "default");
      const number = Number(params.get("page"));
      setPage(Number.isInteger(number) && number > 0 ? number : 1);
      setPageSize([12, 24, 48].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 12);
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const loadSummary = useCallback(async () => {
    try { setOverview(await backoffice.plansOverview()); setSummaryError(false); }
    catch { setSummaryError(true); }
  }, []);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const loadRows = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const plans = await backoffice.listPlans({ q: search || undefined, status: statusFilter === "all" ? undefined : statusFilter, active: activeFilter === "all" ? undefined : activeFilter === "active", price_max: priceMax ? Number(priceMax) : undefined, page, page_size: pageSize, ordering });
      if (id !== requestId.current) return;
      setRows(plans.results); setCount(plans.count); setPage(plans.page ?? page); setSelected([]);
    } catch { if (id === requestId.current) setError("Não foi possível carregar os planos. Tente novamente."); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [search, statusFilter, activeFilter, priceMax, page, pageSize, ordering]);

  useEffect(() => {
    if (!ready) return;
    // Invalidate requests immediately, including during the search debounce.
    const sequence = requestId;
    ++sequence.current;
    setSelected([]);
    setLoading(true);
    const params = new URLSearchParams(window.location.search);
    const values = { q: search, status: statusFilter === "all" ? "" : statusFilter, active: activeFilter === "all" ? "" : activeFilter, price_max: priceMax, ordering: ordering === "default" ? "" : ordering, page: page === 1 ? "" : String(page), page_size: pageSize === 12 ? "" : String(pageSize) };
    Object.entries(values).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    const timer = window.setTimeout(() => void loadRows(), 250);
    return () => { window.clearTimeout(timer); ++sequence.current; };
  }, [ready, loadRows, search, statusFilter, activeFilter, priceMax, ordering, page, pageSize]);

  const load = () => Promise.all([loadRows(), loadSummary()]);
  const hasFilters = Boolean(search || statusFilter !== "all" || activeFilter !== "all" || priceMax);
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setActiveFilter("all"); setPriceMax(""); setPage(1); };
  const filterStatus = (value: string) => { setStatusFilter(value); setPage(1); };

  const openCreate = () => { setError(null); setEditing(null); setForm(emptyForm); setCreateOpen(true); };
  const openEdit = (plan: Plan) => {
    setError(null); setEditing(plan);
    setForm({ name: plan.name, slug: plan.slug, description: plan.description || "", monthly_price: String(plan.monthly_price || ""), semiannual_price: String(plan.semiannual_price || ""), annual_price: String(plan.annual_price || ""), features: (Array.isArray(plan.features) ? plan.features : []).join("\n"), status: plan.status, is_highlighted: plan.is_highlighted, trial_days: String(plan.trial_days ?? 0), is_active: plan.is_active, sort_order: String(plan.sort_order ?? 0) });
    setEditOpen(true);
  };
  const payload = (): PlanPayload => ({ name: form.name.trim(), slug: form.slug.trim().toLowerCase(), description: form.description.trim(), monthly_price: Number(form.monthly_price || 0), semiannual_price: Number(form.semiannual_price || 0), annual_price: Number(form.annual_price || 0), features: form.features.split("\n").map((value) => value.trim()).filter(Boolean), status: form.status, is_highlighted: form.is_highlighted, trial_days: Number(form.trial_days || 0), is_active: form.is_active, sort_order: Number(form.sort_order || 0) });
  const submit = async () => {
    const data = payload();
    if (!data.name || !data.slug || !/^[a-z0-9_-]+$/.test(data.slug) || [data.monthly_price, data.semiannual_price, data.annual_price, data.trial_days, data.sort_order].some(value => !Number.isFinite(Number(value)) || Number(value) < 0) || !Number.isInteger(data.trial_days) || !Number.isInteger(data.sort_order)) {
      setError("Confira nome, slug (letras sem acento, números, hífen ou sublinhado), preços e números inteiros não negativos para teste e ordem."); return;
    }
    if (editing && (data.monthly_price !== Number(editing.monthly_price) || data.semiannual_price !== Number(editing.semiannual_price) || data.annual_price !== Number(editing.annual_price)) && !window.confirm("Esta alteração de preço não muda automaticamente assinaturas existentes. Deseja continuar?")) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (editing) { await backoffice.updatePlan(editing.id, data); setEditOpen(false); setNotice("Plano atualizado com segurança."); }
      else { await backoffice.createPlan(data); setCreateOpen(false); setNotice(`Plano criado: ${statusLabels[data.status!].toLowerCase()}.`); }
      void load();
    } catch (err: any) { setError(Object.entries(err?.response?.data || {}).map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(" ") : value}`).join(" · ") || (editing ? "Falha ao atualizar o plano." : "Falha ao criar o plano.")); }
    finally { setBusy(false); }
  };
  const updateStatus = async (plan: Plan, nextStatus: Plan["status"]) => {
    if (nextStatus === "archived" && !window.confirm("Arquivar interrompe novas vendas, mas preserva assinaturas existentes. Continuar?")) return;
    setBusy(true); setError(null);
    try { await backoffice.updatePlan(plan.id, { status: nextStatus, is_active: nextStatus === "published" ? plan.is_active : false }); setNotice(`Plano ${statusLabels[nextStatus].toLowerCase()}.`); void load(); }
    catch { setError("Não foi possível atualizar o status do plano."); } finally { setBusy(false); }
  };
  const duplicate = async (plan: Plan) => { setBusy(true); setError(null); try { await backoffice.duplicatePlan(plan.id); setNotice("Cópia criada como rascunho para revisão."); void load(); } catch { setError("Não foi possível duplicar o plano."); } finally { setBusy(false); } };
  const bulk = async (action: "publish" | "draft" | "archive" | "activate" | "deactivate") => { if (!selected.length) return; if (action === "archive" && !window.confirm("Arquivar os planos selecionados? Assinaturas existentes serão preservadas.")) return; setBusy(true); setError(null); try { const result = await backoffice.bulkPlans(selected, action); setSelected([]); setNotice(`${result.updated} plano(s) atualizado(s).`); void load(); } catch (err: any) { setError(err?.response?.data?.detail || "Não foi possível concluir a ação em massa."); } finally { setBusy(false); } };
  const doDelete = async () => { if (!toDelete) return; setBusy(true); setError(null); try { await backoffice.deletePlan(toDelete.id); setToDelete(null); setNotice("Plano removido."); void load(); } catch (err: any) { setError(err?.response?.data?.detail || "Não foi possível remover o plano."); } finally { setBusy(false); } };
  const allSelected = rows.length > 0 && rows.every(plan => selected.includes(plan.id));
  const selectedLabel = useMemo(() => `${selected.length} selecionado${selected.length === 1 ? "" : "s"}`, [selected.length]);
  const dialogOpen = createOpen || editOpen;

  return <div className="space-y-6">
    <PageHeader title="Planos" description="Estruture a oferta comercial, acompanhe adesão e preserve os contratos atuais." actions={<Button onClick={openCreate} className="bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"><Plus className="h-4 w-4" /> Novo plano</Button>} />
    <FloatingNotice message={notice} onDismiss={() => setNotice(null)} />
    {error && <Notice kind="error">{error}</Notice>}
    {summaryError && <Notice kind="error">Não foi possível atualizar os indicadores. <Button variant="ghost" size="sm" onClick={() => void loadSummary()}>Tentar novamente</Button></Notice>}
    <section aria-label="Resumo geral dos planos" className="space-y-2">
      <p className="text-xs text-slate-500">Visão geral de todos os planos · independente dos filtros da lista</p>
      <div className={`grid gap-3 sm:grid-cols-2 ${overview?.mrr_estimated != null ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        <button type="button" className="rounded-xl text-left focus-visible:outline-2 focus-visible:outline-indigo-500 aria-pressed:ring-2 aria-pressed:ring-indigo-500" aria-pressed={statusFilter === "published"} onClick={() => filterStatus(statusFilter === "published" ? "all" : "published")}><StatCard title="Publicados" value={overview?.published ?? "—"} hint="Filtrar publicados" icon={<Package className="h-4 w-4" />} /></button>
        <button type="button" className="rounded-xl text-left focus-visible:outline-2 focus-visible:outline-indigo-500 aria-pressed:ring-2 aria-pressed:ring-indigo-500" aria-pressed={statusFilter === "draft"} onClick={() => filterStatus(statusFilter === "draft" ? "all" : "draft")}><StatCard title="Rascunhos" value={overview?.draft ?? "—"} hint="Filtrar rascunhos" accent="amber" icon={<Pencil className="h-4 w-4" />} /></button>
        <button type="button" className="rounded-xl text-left focus-visible:outline-2 focus-visible:outline-indigo-500 aria-pressed:ring-2 aria-pressed:ring-indigo-500" aria-pressed={statusFilter === "archived"} onClick={() => filterStatus(statusFilter === "archived" ? "all" : "archived")}><StatCard title="Arquivados" value={overview?.archived ?? "—"} hint="Filtrar arquivados" accent="sky" icon={<Archive className="h-4 w-4" />} /></button>
        <StatCard title="Assinaturas vigentes" value={overview ? overview.plans.reduce((sum, item) => sum + item.subscribers_active, 0) : "—"} hint="Ativas e dentro da validade" accent="emerald" icon={<Users className="h-4 w-4" />} />
        {overview?.mrr_estimated != null && <StatCard title="MRR estimado" value={formatMoney(overview.mrr_estimated)} hint="Receita mensal em BRL; preço contratado quando disponível" accent="violet" icon={<WalletCards className="h-4 w-4" />} />}
      </div>
    </section>
    <FilterBar active={hasFilters} onClear={clearFilters}>
      <div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="plan-search">Buscar planos</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 text-slate-400" /><Input id="plan-search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Nome, slug ou benefício" className="pl-9" /></div></div>
      <div className="space-y-2"><Label htmlFor="plan-status-filter">Status</Label><Select value={statusFilter} onValueChange={filterStatus}><SelectTrigger id="plan-status-filter" className="w-full xl:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="published">Publicados</SelectItem><SelectItem value="draft">Rascunhos</SelectItem><SelectItem value="archived">Arquivados</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="plan-active-filter">Disponibilidade</Label><Select value={activeFilter} onValueChange={value => { setActiveFilter(value); setPage(1); }}><SelectTrigger id="plan-active-filter" className="w-full xl:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Qualquer venda</SelectItem><SelectItem value="active">À venda</SelectItem><SelectItem value="inactive">Indisponíveis</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="plan-price-filter">Preço mensal até (R$)</Label><Input id="plan-price-filter" type="number" min="0" step="0.01" value={priceMax} onChange={event => { if (!event.target.value || Number(event.target.value) >= 0) { setPriceMax(event.target.value); setPage(1); } }} placeholder="Sem limite" className="w-full xl:w-44" /></div>
    </FilterBar>
    <ListToolbar count={count} loading={loading} ordering={ordering} onOrderingChange={value => { setOrdering(value); setPage(1); }} options={[{ value: "default", label: "Ordem do catálogo" }, { value: "name", label: "Nome (A–Z)" }, { value: "price", label: "Menor preço" }, { value: "-price", label: "Maior preço" }]} />
    {error && <Button variant="outline" onClick={() => void loadRows()} disabled={loading}>Atualizar lista</Button>}
    {selected.length > 0 && <Card className="flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30"><p className="text-sm font-medium">{selectedLabel}</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void bulk("publish")} disabled={busy}>Publicar</Button><Button size="sm" variant="outline" onClick={() => void bulk("draft")} disabled={busy}>Rascunho</Button><Button size="sm" variant="outline" onClick={() => void bulk("activate")} disabled={busy}>Liberar venda</Button><Button size="sm" variant="outline" onClick={() => void bulk("deactivate")} disabled={busy}>Pausar venda</Button><Button size="sm" variant="destructive" onClick={() => void bulk("archive")} disabled={busy}>Arquivar</Button></div></Card>}
    {loading && <Card><CardContent className="p-6"><LoadingState label="Carregando planos..." /></CardContent></Card>}
    {!loading && !error && rows.length === 0 && <Card><EmptyState icon={<Package className="h-5 w-5" />} title={hasFilters ? "Nenhum plano corresponde aos filtros" : "Seu catálogo ainda não tem planos"} description={hasFilters ? "Experimente outro termo ou limpe os filtros para ver todos os planos." : "Crie o primeiro plano para organizar sua oferta."} /><div className="flex justify-center pb-6"><Button variant="outline" onClick={hasFilters ? clearFilters : openCreate}>{hasFilters ? "Limpar filtros" : "Criar primeiro plano"}</Button></div></Card>}
    {!loading && rows.length > 0 && <div className="flex items-center gap-2 px-1 text-sm text-slate-500"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((plan) => plan.id))} aria-label="Selecionar planos desta página" className="h-4 w-4 accent-indigo-600" /> Selecionar planos desta página</div>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{!loading && rows.map((plan) => {
      const metrics = metricsFor(overview, plan.id);
      return <Card key={plan.id} className={plan.is_highlighted ? "border-indigo-300 ring-1 ring-indigo-200 dark:border-indigo-700 dark:ring-indigo-900" : ""}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-2"><div className="flex gap-3"><input type="checkbox" checked={selected.includes(plan.id)} onChange={() => setSelected((ids) => ids.includes(plan.id) ? ids.filter((id) => id !== plan.id) : [...ids, plan.id])} aria-label={`Selecionar ${plan.name}`} className="mt-1 h-4 w-4 accent-indigo-600" /><div><div className="flex items-center gap-2"><CardTitle role="heading" aria-level={2} className="text-base">{plan.name}</CardTitle>{plan.is_highlighted && <Sparkles className="h-4 w-4 text-amber-500" aria-label="Plano destacado" />}</div><p className="mt-0.5 text-xs text-slate-500">/{plan.slug}</p></div></div><div className="flex gap-1"><Button variant="ghost" size="icon" title="Prévia" aria-label={`Visualizar ${plan.name}`} onClick={() => setPreview(plan)}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Duplicar" aria-label={`Duplicar ${plan.name}`} onClick={() => void duplicate(plan)} disabled={busy}><Copy className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${plan.name}`} onClick={() => openEdit(plan)}><Pencil className="h-4 w-4" /></Button></div></div></CardHeader><CardContent><div className="flex items-center justify-between gap-2"><StatusBadge status={plan.status === "published" && plan.is_active ? "active" : plan.status} /><Select value={plan.status} disabled={busy} onValueChange={(value) => void updateStatus(plan, value as Plan["status"])}><SelectTrigger className="h-8 w-32 text-xs" aria-label={`Status de ${plan.name}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="published">Publicar</SelectItem><SelectItem value="archived">Arquivar</SelectItem></SelectContent></Select></div>{plan.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{plan.description}</p>}<div className="mt-4 grid grid-cols-3 gap-2 text-center">{[["Mensal", plan.monthly_price], ["Semestral", plan.semiannual_price], ["Anual", plan.annual_price]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="break-words text-xs font-semibold tabular-nums">{formatPrice(value as string)}</p></div>)}</div>{metrics && <div className="mt-4 grid grid-cols-3 gap-2 border-y py-3 text-center text-xs"><div><p className="font-semibold text-slate-800 dark:text-white">{metrics.subscribers_active}</p><p className="text-slate-500">ativos</p></div><div><p className="font-semibold text-slate-800 dark:text-white">{metrics.retention_rate ?? "—"}{metrics.retention_rate !== null ? "%" : ""}</p><p className="text-slate-500" title="Proporção das assinaturas vigentes sobre todas as assinaturas deste plano">vigentes / total</p></div>{metrics.mrr_estimated != null && <div><p className="font-semibold text-slate-800 dark:text-white">{formatMoney(metrics.mrr_estimated)}</p><p className="text-slate-500">MRR estimado</p></div>}</div>}<ul className="mt-4 space-y-1">{(Array.isArray(plan.features) ? plan.features : []).slice(0, 4).map((feature) => <li key={feature} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />{feature}</li>)}</ul><div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-500">{plan.trial_days ? `${plan.trial_days} dias de teste` : "Sem período de teste"}</span><div className="flex gap-1"><Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => setToDelete(plan)} disabled={busy}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button><Switch checked={plan.is_active} disabled={busy || plan.status !== "published"} onCheckedChange={() => void (async () => { setBusy(true); try { await backoffice.updatePlan(plan.id, { is_active: !plan.is_active }); setNotice(plan.is_active ? "Venda pausada." : "Plano disponível para venda."); void load(); } catch { setError("Não foi possível alterar a disponibilidade."); } finally { setBusy(false); } })()} aria-label={`Alternar venda do plano ${plan.name}`} /></div></div></CardContent></Card>;
    })}</section>
    <ListPagination count={count} page={page} pageSize={pageSize} disabled={loading} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} />
    <Dialog open={dialogOpen} onOpenChange={(open) => editing ? setEditOpen(open) : setCreateOpen(open)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle><DialogDescription>{editing ? "Mudanças de preço não são aplicadas automaticamente às assinaturas atuais." : "O novo plano começa em rascunho, pronto para revisão."}</DialogDescription></DialogHeader>{error && <Notice kind="error">{error}</Notice>}<div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Nome comercial</Label><Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="slug">Slug</Label><Input id="slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="description">Descrição comercial</Label><Textarea id="description" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Resumo exibido ao aluno." /></div><div className="grid grid-cols-3 gap-3">{[["monthly_price", "Mensal"], ["semiannual_price", "Semestral"], ["annual_price", "Anual"]].map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label} (R$)</Label><Input id={key} type="number" min="0" step="0.01" value={form[key as "monthly_price" | "semiannual_price" | "annual_price"]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}</div><div className="space-y-2"><div className="flex justify-between"><Label htmlFor="features">Benefícios</Label><span className="text-xs text-slate-400">um por linha</span></div><Textarea id="features" rows={5} value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} placeholder={"Questões ilimitadas\nSimulados completos"} /></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as Plan["status"], is_active: value === "published" && form.is_active })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="published">Publicado</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="trial">Teste (dias)</Label><Input id="trial" type="number" min="0" value={form.trial_days} onChange={(event) => setForm({ ...form, trial_days: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="sort">Ordem</Label><Input id="sort" type="number" min="0" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></div></div><div className="flex flex-wrap gap-6"><label className="flex items-center gap-2 text-sm"><Switch disabled={form.status !== "published"} checked={form.status === "published" && form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} /> Disponível para venda</label><label className="flex items-center gap-2 text-sm"><Switch checked={form.is_highlighted} onCheckedChange={(value) => setForm({ ...form, is_highlighted: value })} /> Destacar como recomendado</label></div></div><DialogFooter><Button variant="outline" onClick={() => editing ? setEditOpen(false) : setCreateOpen(false)} disabled={busy}>Cancelar</Button><Button onClick={() => void submit()} disabled={busy || !form.name || !form.slug}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Salvar plano</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}><DialogContent><DialogHeader><DialogTitle>Resumo do plano</DialogTitle><DialogDescription>Resumo administrativo do plano. A aparência e as condições do checkout podem variar.</DialogDescription></DialogHeader>{preview && <div className="rounded-xl border bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg"><div className="flex items-center justify-between"><h3 className="text-xl font-bold">{preview.name}</h3>{preview.is_highlighted && <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-amber-950">Recomendado</span>}</div><p className="mt-2 text-sm text-indigo-100">{preview.description || "Plano de estudos completo."}</p><p className="mt-5 text-3xl font-bold">{formatPrice(preview.monthly_price)}<span className="text-sm font-normal text-indigo-100">/mês</span></p>{preview.trial_days > 0 && <p className="mt-1 text-xs text-indigo-100">{preview.trial_days} dias para testar</p>}<ul className="mt-5 space-y-2">{(Array.isArray(preview.features) ? preview.features : []).map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-emerald-300" />{feature}</li>)}</ul></div>}</DialogContent></Dialog>
    <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}><DialogContent><DialogHeader><DialogTitle>Excluir plano</DialogTitle><DialogDescription>O plano só pode ser excluído se não possuir assinaturas. Caso contrário, arquive-o para preservar o histórico.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setToDelete(null)} disabled={busy}>Cancelar</Button><Button variant="destructive" onClick={() => void doDelete()} disabled={busy}>{busy ? "Aguarde..." : "Excluir"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
