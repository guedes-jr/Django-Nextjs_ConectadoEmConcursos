"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ShieldCheck, UserPlus, Pencil } from "lucide-react";
import { backoffice, UserRow, Plan, formatDate, cycleLabel } from "@/lib/backoffice";
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { PageHeader } from "@/components/admin/PageHeader";

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerUser, setPickerUser] = useState<UserRow | null>(null);
  const [pickerPlan, setPickerPlan] = useState("");
  const [pickerCycle, setPickerCycle] = useState("mensal");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [users, allPlans] = await Promise.all([backoffice.listUsers({ search }), backoffice.listPlans()]);
      setRows(users.results);
      setPlans(allPlans.results);
    } catch {
      setError("Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  const toggleActive = async (user: UserRow) => {
    setBusy(user.id);
    setError(null);
    setNotice(null);
    try {
      await backoffice.setUserActive(user.id, !user.is_active);
      setNotice(`${user.username} ${user.is_active ? "bloqueado" : "desbloqueado"}.`);
      void load();
    } catch {
      setError("Falha ao atualizar o usuário.");
    } finally {
      setBusy(null);
    }
  };

  const openPicker = (user: UserRow, prefillFromSub = false) => {
    setPickerUser(user);
    if (prefillFromSub && user.subscription) {
      setPickerPlan(user.subscription.plan_slug);
      setPickerCycle(user.subscription.cycle);
    } else {
      setPickerPlan("");
      setPickerCycle("mensal");
    }
    setPickerOpen(true);
  };

  const assign = async () => {
    if (!pickerUser || !pickerPlan) return;
    setBusy(pickerUser.id);
    setError(null);
    setNotice(null);
    try {
      await backoffice.assignSubscription(pickerUser.id, pickerPlan, pickerCycle);
      setPickerOpen(false);
      setNotice("Assinatura atribuída.");
      void load();
    } catch {
      setError("Falha ao atribuir a assinatura.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description="Busque, ative/desative e atribua assinaturas."
      />

      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail..."
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>Usuário</TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead>Registrado em</TableHead>
              <TableHead>Acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8">
                  <LoadingState label="Carregando usuários..." />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState title="Nenhum usuário encontrado" description="Ajuste o termo de busca ou crie um novo usuário." />
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                      {user.username}
                      {user.is_staff && <ShieldCheck className="h-3.5 w-3.5 text-violet-500" />}
                    </p>
                    <p className="text-xs text-slate-500">{user.email || "sem e-mail"}</p>
                  </TableCell>
                  <TableCell>
                    {user.subscription ? (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700 dark:text-slate-200">{user.subscription.plan}</span>
                        <StatusBadge status={user.subscription.status} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => openPicker(user, true)}
                          aria-label="Editar assinatura"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => openPicker(user)}>
                        <UserPlus className="h-4 w-4" /> Atribuir plano
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500">{formatDate(user.date_joined)}</TableCell>
                  <TableCell>
                    <StatusBadge status={user.is_active ? "active" : "blocked"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={user.is_active ? "outline" : "secondary"}
                      size="sm"
                      disabled={busy === user.id}
                      onClick={() => toggleActive(user)}
                    >
                      {busy === user.id ? <Skeleton className="h-4 w-16" /> : user.is_active ? "Bloquear" : "Desbloquear"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pickerUser?.subscription ? "Editar assinatura" : "Atribuir assinatura"}
            </DialogTitle>
            {pickerUser && (
              <DialogDescription>
                {pickerUser.subscription ? `Alterar plano de ${pickerUser.username}` : `Para ${pickerUser.username}`}
              </DialogDescription>
            )}
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void assign();
            }}
            className="space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <Label htmlFor="plan">Plano</Label>
              <Select value={pickerPlan} onValueChange={setPickerPlan} required>
                <SelectTrigger id="plan">
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled className="hidden">
                    Selecione o plano
                  </SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.slug}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle">Ciclo</Label>
              <Select value={pickerCycle} onValueChange={setPickerCycle}>
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
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)} disabled={busy === pickerUser?.id}>
              Cancelar
            </Button>
            <Button onClick={assign} disabled={busy === pickerUser?.id || !pickerPlan}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}