"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Plus, Pencil, Loader2, ShieldOff } from "lucide-react";
import { backoffice, StaffRow, formatDate } from "@/lib/backoffice";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { PageHeader } from "@/components/admin/PageHeader";
import { BadgeViolet } from "@/components/admin/StatusBadge";

const emptyCreate = { username: "", email: "", password: "" };

export default function AdminStaffPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backoffice.listStaff();
      setRows(res.results);
    } catch {
      setError("Não foi possível carregar os usuários staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCreateForm(emptyCreate);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!createForm.username || !createForm.password) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await backoffice.createStaff({
        username: createForm.username,
        email: createForm.email || undefined,
        password: createForm.password,
      });
      setNotice(`Staff "${createForm.username}" criado com sucesso.`);
      setCreateOpen(false);
      void load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Falha ao criar o staff.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (user: StaffRow) => {
    setEditing({ ...user });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(editing.id);
    setError(null);
    setNotice(null);
    try {
      await backoffice.updateStaff(editing.id, {
        is_staff: editing.is_staff,
        is_active: editing.is_active,
        email: editing.email,
        first_name: editing.first_name,
        last_name: editing.last_name,
      });
      setNotice(`Usuário "${editing.username}" atualizado.`);
      setEditOpen(false);
      void load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Falha ao atualizar o staff.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Gerencie os usuários com acesso à área administrativa."
        actions={
          <Button onClick={openCreate} id="btn-novo-staff">
            <Plus className="h-4 w-4" /> Novo staff
          </Button>
        }
      />

      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>Usuário</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Superuser</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último login</TableHead>
              <TableHead>Registrado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8">
                  <LoadingState label="Carregando staff..." />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={<ShieldOff className="h-5 w-5" />}
                    title="Nenhum usuário staff"
                    description="Crie o primeiro usuário staff para começar."
                  />
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                      {user.username}
                    </p>
                    <p className="text-xs text-slate-500">{user.email || "sem e-mail"}</p>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">
                    {[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>
                    {user.is_superuser ? (
                      <BadgeViolet>Superuser</BadgeViolet>
                    ) : (
                      <span className="text-xs text-slate-400">Staff</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        user.is_active
                          ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                          : "text-xs font-medium text-rose-600 dark:text-rose-400"
                      }
                    >
                      {user.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {formatDate(user.last_login)}
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {formatDate(user.date_joined)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(user)}
                      disabled={busy === user.id}
                      aria-label={`Editar ${user.username}`}
                    >
                      {busy === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário staff</DialogTitle>
            <DialogDescription>
              Crie um usuário com acesso à área administrativa. A senha deve ter ao menos 8 caracteres.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-username">Usuário *</Label>
              <Input
                id="staff-username"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="nome_do_usuario"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">E-mail</Label>
              <Input
                id="staff-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="email@exemplo.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">Senha *</Label>
              <Input
                id="staff-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button
              id="btn-criar-staff"
              onClick={submitCreate}
              disabled={creating || !createForm.username || !createForm.password}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editing && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar staff — {editing.username}</DialogTitle>
              <DialogDescription>
                Altere os dados e permissões do usuário.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstname">Nome</Label>
                  <Input
                    id="edit-firstname"
                    value={editing.first_name}
                    onChange={(e) => setEditing({ ...editing, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastname">Sobrenome</Label>
                  <Input
                    id="edit-lastname"
                    value={editing.last_name}
                    onChange={(e) => setEditing({ ...editing, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">E-mail</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Acesso de staff</p>
                  <p className="text-xs text-slate-500">Permite acesso à área administrativa.</p>
                </div>
                <Switch
                  checked={editing.is_staff}
                  onCheckedChange={(v) => setEditing({ ...editing, is_staff: v })}
                  aria-label="Alternar acesso staff"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Conta ativa</p>
                  <p className="text-xs text-slate-500">Desativar impede o login do usuário.</p>
                </div>
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  aria-label="Alternar conta ativa"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy === editing.id}>
                Cancelar
              </Button>
              <Button id="btn-salvar-staff" onClick={saveEdit} disabled={busy === editing.id}>
                {busy === editing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
