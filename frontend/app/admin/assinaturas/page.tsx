"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Pencil, Loader2 } from "lucide-react";
import { backoffice, SubscriptionRow, Plan, formatDate, cycleLabel } from "@/lib/backoffice";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { PageHeader } from "@/components/admin/PageHeader";

const statusOptions = [
  { value: "all", label: "Todos os status" },
  { value: "active", label: "Ativas" },
  { value: "pending_payment", label: "Pagamento pendente" },
  { value: "canceled", label: "Canceladas" },
];

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const [plan, setPlan] = useState("");
  const [cycle, setCycle] = useState("mensal");
  const [status, setStatus] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subs, allPlans] = await Promise.all([
        backoffice.listSubscriptions({ status: statusFilter === "all" ? undefined : statusFilter, search: search || undefined }),
        backoffice.listPlans(),
      ]);
      setRows(subs.results);
      setPlans(allPlans.results);
    } catch {
      setError("Não foi possível carregar as assinaturas.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  const openEdit = (sub: SubscriptionRow) => {
    setEditing(sub);
    setPlan(sub.plan_slug);
    setCycle(sub.cycle);
    setStatus(sub.status);
    setEditOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(editing.id);
    setError(null);
    setNotice(null);
    try {
      await backoffice.updateSubscription(editing.id, { plan_slug: plan, cycle, status });
      setEditOpen(false);
      setNotice("Assinatura atualizada.");
      void load();
    } catch {
      setError("Falha ao atualizar a assinatura.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assinaturas"
        description="Acompanhe e atualize o status das assinaturas dos alunos."
      />

      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuário ou e-mail..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>Usuário</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8">
                  <LoadingState label="Carregando assinaturas..." />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState title="Nenhuma assinatura encontrada" />
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{sub.username}</p>
                    <p className="text-xs text-slate-500">{sub.email || "sem e-mail"}</p>
                  </TableCell>
                  <TableCell className="text-slate-700 dark:text-slate-200">{sub.plan_name}</TableCell>
                  <TableCell>
                    <StatusBadge status={sub.cycle} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sub.status} />
                  </TableCell>
                  <TableCell className="text-slate-500">{formatDate(sub.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(sub)} disabled={busy === sub.id} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar assinatura</DialogTitle>
            {editing && (
              <DialogDescription>
                {editing.username} · {editing.plan_name}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan">Plano</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger id="plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.slug}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle">Ciclo</Label>
              <Select value={cycle} onValueChange={setCycle}>
                <SelectTrigger id="cycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(cycleLabel).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="pending_payment">Pagamento pendente</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy === editing?.id}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy === editing?.id}>
              {busy === editing?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}