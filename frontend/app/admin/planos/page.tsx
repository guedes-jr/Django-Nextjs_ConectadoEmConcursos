"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { backoffice, Plan, PlanPayload } from "@/lib/backoffice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { PageHeader } from "@/components/admin/PageHeader";

const emptyForm = { name: "", slug: "", monthly_price: "", semiannual_price: "", annual_price: "", features: "", is_active: true, sort_order: "0" };

function formatPrice(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return n === 0 ? "Grátis" : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

export default function AdminPlansPage() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backoffice.listPlans();
      setRows(res.results);
    } catch {
      setError("Não foi possível carregar os planos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const payload: PlanPayload = {
      name: form.name,
      slug: form.slug,
      monthly_price: form.monthly_price ? Number(form.monthly_price) : 0,
      semiannual_price: form.semiannual_price ? Number(form.semiannual_price) : 0,
      annual_price: form.annual_price ? Number(form.annual_price) : 0,
      features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    try {
      if (editing) {
        await backoffice.updatePlan(editing.id, payload);
        setNotice("Plano atualizado.");
        setEditOpen(false);
      } else {
        await backoffice.createPlan(payload);
        setNotice("Plano criado.");
        setCreateOpen(false);
      }
      void load();
    } catch {
      setError(editing ? "Falha ao atualizar o plano." : "Falha ao criar o plano.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (plan: Plan) => {
    setBusy(true);
    setError(null);
    try {
      await backoffice.updatePlan(plan.id, { is_active: !plan.is_active });
      void load();
    } catch {
      setError("Falha ao atualizar o plano.");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await backoffice.deletePlan(toDelete.id);
      setNotice("Plano removido.");
      setToDelete(null);
      void load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Falha ao remover o plano.");
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setCreateOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      monthly_price: String(plan.monthly_price || ""),
      semiannual_price: String(plan.semiannual_price || ""),
      annual_price: String(plan.annual_price || ""),
      features: (plan.features ?? []).join("\n"),
      is_active: plan.is_active,
      sort_order: String(plan.sort_order ?? 0),
    });
    setEditOpen(true);
  };

  const dialogOpen = createOpen || editOpen;
  const dialogOpener = (open: boolean) => {
    if (editing) setEditOpen(open);
    else setCreateOpen(open);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos"
        description="Configure os planos e preços disponíveis para venda."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo plano
          </Button>
        }
      />

      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {loading && (
        <Card>
          <CardContent className="p-6">
            <LoadingState label="Carregando planos..." />
          </CardContent>
        </Card>
      )}

      {!loading && rows.length === 0 && (
        <Card>
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="Nenhum plano cadastrado"
            description="Crie o primeiro plano para começar a vender assinaturas."
          />
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!loading &&
          rows.map((plan) => (
            <Card key={plan.id}>
              <CardHeader className="space-y-0 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <p className="mt-0.5 text-xs text-slate-500">/{plan.slug}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(plan)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(plan)} aria-label="Excluir" className="text-rose-600 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <StatusBadge status={plan.is_active ? "active" : "inactive"} />
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {plan.is_active ? "Ativo" : "Inativo"}
                    <Switch
                      checked={plan.is_active}
                      onCheckedChange={() => toggleActive(plan)}
                      disabled={busy}
                      aria-label={`Alternar ${plan.name}`}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Mensal</p>
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatPrice(plan.monthly_price)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Semestral</p>
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatPrice(plan.semiannual_price)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Anual</p>
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatPrice(plan.annual_price)}
                    </p>
                  </div>
                </div>

                <ul className="mt-4 space-y-1">
                  {(plan.features ?? []).slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className="h-1 w-1 rounded-full bg-indigo-500" /> {f}
                    </li>
                  ))}
                  {(plan.features ?? []).length > 4 && (
                    <li className="pl-3 text-xs text-slate-400">+{(plan.features ?? []).length - 4} itens</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
      </section>

      <Dialog open={dialogOpen} onOpenChange={dialogOpener}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle>
            <DialogDescription>
              {editing ? "Atualize as informações do plano." : "Preencha os dados do novo plano."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthly">Mensal (R$)</Label>
                <Input id="monthly" type="number" min="0" step="0.01" value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="semiannual">Semestral (R$)</Label>
                <Input id="semiannual" type="number" min="0" step="0.01" value={form.semiannual_price} onChange={(e) => setForm({ ...form, semiannual_price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="annual">Anual (R$)</Label>
                <Input id="annual" type="number" min="0" step="0.01" value={form.annual_price} onChange={(e) => setForm({ ...form, annual_price: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="features">Benefícios</Label>
                <span className="text-xs text-slate-400">um por linha</span>
              </div>
              <Textarea id="features" rows={5} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder={"Acesso ilimitado a questões\nSimulados completos\n..."} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sort">Ordem</Label>
                <Input id="sort" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  aria-label="Plano ativo"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">Publicar plano</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (editing ? setEditOpen(false) : setCreateOpen(false))} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy || !form.name || !form.slug}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir plano</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{toDelete?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy ? "Aguarde..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}