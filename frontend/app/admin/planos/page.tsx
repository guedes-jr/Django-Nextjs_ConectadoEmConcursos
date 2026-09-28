"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PageHeader } from "@/components/admin/PageHeader";

type PlanForm = { name: string; slug: string; description: string; monthly_price: string; semiannual_price: string; annual_price: string; features: string; status: Plan["status"]; is_highlighted: boolean; trial_days: string; is_active: boolean; sort_order: string };
const emptyForm: PlanForm = { name: "", slug: "", description: "", monthly_price: "", semiannual_price: "", annual_price: "", features: "", status: "draft", is_highlighted: false, trial_days: "0", is_active: false, sort_order: "0" };
const statusLabels = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" };

function formatPrice(value: string | number | null | undefined) { const n = Number(value ?? 0); return n === 0 ? "Grátis" : `R$ ${n.toFixed(2).replace(".", ",")}`; }
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
  const [selected, setSelected] = useState<number[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [preview, setPreview] = useState<Plan | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [plans, summary] = await Promise.all([
        backoffice.listPlans({ q: search || undefined, status: statusFilter === "all" ? undefined : statusFilter, active: activeFilter === "all" ? undefined : activeFilter === "active", price_max: priceMax ? Number(priceMax) : undefined }),
        backoffice.plansOverview(),
      ]);
      setRows(plans.results); setOverview(summary); setSelected((ids) => ids.filter((id) => plans.results.some((plan) => plan.id === id)));
    } catch { setError("Não foi possível carregar os planos."); }
    finally { setLoading(false); }
  }, [search, statusFilter, activeFilter, priceMax]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), search ? 250 : 0); return () => window.clearTimeout(timer); }, [load, search]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setCreateOpen(true); };
  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({ name: plan.name, slug: plan.slug, description: plan.description || "", monthly_price: String(plan.monthly_price || ""), semiannual_price: String(plan.semiannual_price || ""), annual_price: String(plan.annual_price || ""), features: (plan.features ?? []).join("\n"), status: plan.status, is_highlighted: plan.is_highlighted, trial_days: String(plan.trial_days ?? 0), is_active: plan.is_active, sort_order: String(plan.sort_order ?? 0) });
    setEditOpen(true);
  };
  const payload = (): PlanPayload => ({ name: form.name.trim(), slug: form.slug.trim().toLowerCase(), description: form.description.trim(), monthly_price: Number(form.monthly_price || 0), semiannual_price: Number(form.semiannual_price || 0), annual_price: Number(form.annual_price || 0), features: form.features.split("\n").map((value) => value.trim()).filter(Boolean), status: form.status, is_highlighted: form.is_highlighted, trial_days: Number(form.trial_days || 0), is_active: form.is_active, sort_order: Number(form.sort_order || 0) });
  const submit = async () => {
    const data = payload();
    if (editing && (data.monthly_price !== Number(editing.monthly_price) || data.semiannual_price !== Number(editing.semiannual_price) || data.annual_price !== Number(editing.annual_price)) && !window.confirm("Esta alteração de preço não muda automaticamente assinaturas existentes. Deseja continuar?")) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (editing) { await backoffice.updatePlan(editing.id, data); setEditOpen(false); setNotice("Plano atualizado com segurança."); }
      else { await backoffice.createPlan(data); setCreateOpen(false); setNotice("Plano criado como rascunho."); }
      void load();
    } catch (err: any) { setError(err?.response?.data?.detail || (editing ? "Falha ao atualizar o plano." : "Falha ao criar o plano.")); }
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
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const selectedLabel = useMemo(() => `${selected.length} selecionado${selected.length === 1 ? "" : "s"}`, [selected.length]);
  const dialogOpen = createOpen || editOpen;

  return <div className="space-y-6">
    <PageHeader title="Planos" description="Estruture a oferta comercial, acompanhe adesão e preserve os contratos atuais." actions={<Button onClick={openCreate} className="bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"><Plus className="h-4 w-4" /> Novo plano</Button>} />
    <FloatingNotice message={notice} onDismiss={() => setNotice(null)} />
    {error && <Notice kind="error">{error}</Notice>}
    {overview && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["Planos publicados", overview.published, Package, "text-indigo-600"], ["Rascunhos", overview.draft, Pencil, "text-amber-600"], ["Arquivados", overview.archived, Archive, "text-slate-500"], ["Assinantes ativos", overview.plans.reduce((sum, item) => sum + item.subscribers_active, 0), Users, "text-emerald-600"], ["MRR estimado", `R$ ${overview.mrr_estimated}`, WalletCards, "text-violet-600"]].map(([label, value, Icon, color]: any) => <Card key={label} className="p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><Icon className={`h-4 w-4 ${color}`} /></div><p className="mt-2 text-2xl font-bold">{value}</p></Card>)}
    </section>}
    <Card className="p-4"><div className="flex flex-wrap items-center gap-3"><div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, slug ou benefício" className="pl-9" /></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="published">Publicados</SelectItem><SelectItem value="draft">Rascunhos</SelectItem><SelectItem value="archived">Arquivados</SelectItem></SelectContent></Select><Select value={activeFilter} onValueChange={setActiveFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Qualquer venda</SelectItem><SelectItem value="active">À venda</SelectItem><SelectItem value="inactive">Indisponíveis</SelectItem></SelectContent></Select><Input type="number" min="0" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} placeholder="Preço máx. mensal" className="w-44" /></div></Card>
    {selected.length > 0 && <Card className="flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30"><p className="text-sm font-medium">{selectedLabel}</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void bulk("publish")} disabled={busy}>Publicar</Button><Button size="sm" variant="outline" onClick={() => void bulk("draft")} disabled={busy}>Rascunho</Button><Button size="sm" variant="outline" onClick={() => void bulk("activate")} disabled={busy}>Liberar venda</Button><Button size="sm" variant="outline" onClick={() => void bulk("deactivate")} disabled={busy}>Pausar venda</Button><Button size="sm" variant="destructive" onClick={() => void bulk("archive")} disabled={busy}>Arquivar</Button></div></Card>}
    {loading && <Card><CardContent className="p-6"><LoadingState label="Carregando planos..." /></CardContent></Card>}
    {!loading && rows.length === 0 && <Card><EmptyState icon={<Package className="h-5 w-5" />} title="Nenhum plano encontrado" description="Ajuste os filtros ou crie o primeiro plano para iniciar a oferta." /></Card>}
    {!loading && rows.length > 0 && <div className="flex items-center gap-2 px-1 text-sm text-slate-500"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((plan) => plan.id))} aria-label="Selecionar todos os planos" className="h-4 w-4 accent-indigo-600" /> Selecionar todos os resultados</div>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{!loading && rows.map((plan) => {
      const metrics = metricsFor(overview, plan.id);
      return <Card key={plan.id} className={plan.is_highlighted ? "border-indigo-300 ring-1 ring-indigo-200 dark:border-indigo-700 dark:ring-indigo-900" : ""}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-2"><div className="flex gap-3"><input type="checkbox" checked={selected.includes(plan.id)} onChange={() => setSelected((ids) => ids.includes(plan.id) ? ids.filter((id) => id !== plan.id) : [...ids, plan.id])} aria-label={`Selecionar ${plan.name}`} className="mt-1 h-4 w-4 accent-indigo-600" /><div><div className="flex items-center gap-2"><CardTitle className="text-base">{plan.name}</CardTitle>{plan.is_highlighted && <Sparkles className="h-4 w-4 text-amber-500" aria-label="Plano destacado" />}</div><p className="mt-0.5 text-xs text-slate-500">/{plan.slug}</p></div></div><div className="flex gap-1"><Button variant="ghost" size="icon" title="Prévia" onClick={() => setPreview(plan)}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Duplicar" onClick={() => void duplicate(plan)} disabled={busy}><Copy className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(plan)}><Pencil className="h-4 w-4" /></Button></div></div></CardHeader><CardContent><div className="flex items-center justify-between gap-2"><StatusBadge status={plan.status === "published" && plan.is_active ? "active" : plan.status} /><Select value={plan.status} onValueChange={(value) => void updateStatus(plan, value as Plan["status"])}><SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="published">Publicar</SelectItem><SelectItem value="archived">Arquivar</SelectItem></SelectContent></Select></div>{plan.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{plan.description}</p>}<div className="mt-4 grid grid-cols-3 gap-2 text-center">{[["Mensal", plan.monthly_price], ["Semestral", plan.semiannual_price], ["Anual", plan.annual_price]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="truncate text-sm font-semibold">{formatPrice(value as string)}</p></div>)}</div>{metrics && <div className="mt-4 grid grid-cols-3 gap-2 border-y py-3 text-center text-xs"><div><p className="font-semibold text-slate-800 dark:text-white">{metrics.subscribers_active}</p><p className="text-slate-500">ativos</p></div><div><p className="font-semibold text-slate-800 dark:text-white">{metrics.retention_rate ?? "—"}{metrics.retention_rate !== null ? "%" : ""}</p><p className="text-slate-500">retenção</p></div><div><p className="font-semibold text-slate-800 dark:text-white">R$ {metrics.mrr_estimated}</p><p className="text-slate-500">MRR</p></div></div>}<ul className="mt-4 space-y-1">{(plan.features ?? []).slice(0, 4).map((feature) => <li key={feature} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />{feature}</li>)}</ul><div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-500">{plan.trial_days ? `${plan.trial_days} dias de teste` : "Sem período de teste"}</span><div className="flex gap-1"><Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => setToDelete(plan)} disabled={busy}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button><Switch checked={plan.is_active} disabled={busy || plan.status !== "published"} onCheckedChange={() => void (async () => { setBusy(true); try { await backoffice.updatePlan(plan.id, { is_active: !plan.is_active }); setNotice(plan.is_active ? "Venda pausada." : "Plano disponível para venda."); void load(); } catch { setError("Não foi possível alterar a disponibilidade."); } finally { setBusy(false); } })()} aria-label={`Alternar venda do plano ${plan.name}`} /></div></div></CardContent></Card>;
    })}</section>
    <Dialog open={dialogOpen} onOpenChange={(open) => editing ? setEditOpen(open) : setCreateOpen(open)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle><DialogDescription>{editing ? "Mudanças de preço não são aplicadas automaticamente às assinaturas atuais." : "O novo plano começa em rascunho, pronto para revisão."}</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Nome comercial</Label><Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="slug">Slug</Label><Input id="slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="description">Descrição comercial</Label><Textarea id="description" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Resumo exibido ao aluno." /></div><div className="grid grid-cols-3 gap-3">{[["monthly_price", "Mensal"], ["semiannual_price", "Semestral"], ["annual_price", "Anual"]].map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label} (R$)</Label><Input id={key} type="number" min="0" step="0.01" value={form[key as "monthly_price" | "semiannual_price" | "annual_price"]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}</div><div className="space-y-2"><div className="flex justify-between"><Label htmlFor="features">Benefícios</Label><span className="text-xs text-slate-400">um por linha</span></div><Textarea id="features" rows={5} value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} placeholder={"Questões ilimitadas\nSimulados completos"} /></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as Plan["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="published">Publicado</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="trial">Teste (dias)</Label><Input id="trial" type="number" min="0" value={form.trial_days} onChange={(event) => setForm({ ...form, trial_days: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="sort">Ordem</Label><Input id="sort" type="number" min="0" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></div></div><div className="flex flex-wrap gap-6"><label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} /> Disponível para venda</label><label className="flex items-center gap-2 text-sm"><Switch checked={form.is_highlighted} onCheckedChange={(value) => setForm({ ...form, is_highlighted: value })} /> Destacar como recomendado</label></div></div><DialogFooter><Button variant="outline" onClick={() => editing ? setEditOpen(false) : setCreateOpen(false)} disabled={busy}>Cancelar</Button><Button onClick={() => void submit()} disabled={busy || !form.name || !form.slug}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Salvar plano</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}><DialogContent><DialogHeader><DialogTitle>Prévia para o aluno</DialogTitle><DialogDescription>Visualização comercial antes da publicação.</DialogDescription></DialogHeader>{preview && <div className="rounded-xl border bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg"><div className="flex items-center justify-between"><h3 className="text-xl font-bold">{preview.name}</h3>{preview.is_highlighted && <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-amber-950">Recomendado</span>}</div><p className="mt-2 text-sm text-indigo-100">{preview.description || "Plano de estudos completo."}</p><p className="mt-5 text-3xl font-bold">{formatPrice(preview.monthly_price)}<span className="text-sm font-normal text-indigo-100">/mês</span></p>{preview.trial_days > 0 && <p className="mt-1 text-xs text-indigo-100">{preview.trial_days} dias para testar</p>}<ul className="mt-5 space-y-2">{preview.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-emerald-300" />{feature}</li>)}</ul><Button className="mt-6 w-full bg-white text-indigo-700 hover:bg-indigo-50">Assinar agora</Button></div>}</DialogContent></Dialog>
    <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}><DialogContent><DialogHeader><DialogTitle>Excluir plano</DialogTitle><DialogDescription>O plano só pode ser excluído se não possuir assinaturas. Caso contrário, arquive-o para preservar o histórico.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setToDelete(null)} disabled={busy}>Cancelar</Button><Button variant="destructive" onClick={() => void doDelete()} disabled={busy}>{busy ? "Aguarde..." : "Excluir"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
