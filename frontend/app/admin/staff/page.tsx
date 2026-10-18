"use client";

import { useRef, useState } from "react";
import { ShieldCheck, Plus, Pencil, Loader2, ShieldOff, Search, Users, UserCheck, UserX } from "lucide-react";
import { backoffice, StaffRow, formatDate } from "@/lib/backoffice";
import { useMe } from "@/lib/useMe";
import { useAdminListing, adminError } from "@/components/admin/useAdminListing";
import { StatCard } from "@/components/admin/StatCard";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { FilterBar, ListToolbar, ListPagination, AdminFilterSelect } from "@/components/admin/ListControls";
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
import { BadgeViolet, StatusBadge } from "@/components/admin/StatusBadge";

const emptyCreate: { username: string; email: string; password: string; role: "admin" | "editor" | "reviewer" } = { username: "", email: "", password: "", role: "reviewer" };

const defaults = {search: "", status: "", role: "", ordering: "name", page: "1", page_size: "12"};
const roleLabels: Record<string, string> = {admin: "Administrador", editor: "Editor", reviewer: "Revisor"};
export default function AdminStaffPage() {
  const listing = useAdminListing(defaults, backoffice.listStaff);
  const {query, data, loading, forbidden, change, clear, hasFilters} = listing;
  const rows = data?.results || [];
  const {me} = useMe();
  const mutation = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const error = listing.error;
  const setError = setFormError;
  const [notice, setNotice] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const load = () => listing.reload();

  const openCreate = () => {
    setFormError(null);
    setCreateForm(emptyCreate);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!createForm.username || !createForm.password || mutation.current) return;
    mutation.current = true;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await backoffice.createStaff({
        username: createForm.username,
        email: createForm.email || undefined,
        password: createForm.password,
        role: createForm.role,
      });
      setNotice(`Staff "${createForm.username}" criado com sucesso.`);
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      void load();
    } catch (err: any) {
      setError(adminError(err, "Falha ao criar o staff."));
    } finally {
      mutation.current = false;
      setCreating(false);
    }
  };

  const openEdit = (user: StaffRow) => {
    setFormError(null);
    setEditing({ ...user });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editing || mutation.current) return;
    mutation.current = true;
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
        role: editing.roles[0] || "reviewer",
      });
      setNotice(`Usuário "${editing.username}" atualizado.`);
      setEditOpen(false);
      void load();
    } catch (err: any) {
      setError(adminError(err, "Falha ao atualizar o staff."));
    } finally {
      mutation.current = false;
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Gerencie os usuários com acesso à área administrativa."
        actions={
          data && !forbidden ? <Button onClick={openCreate} id="btn-novo-staff" className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950">
            <Plus className="h-4 w-4" /> Novo staff
          </Button> : undefined
        }
      />

      <FloatingNotice message={notice} onDismiss={() => setNotice(null)} />
      {error && <Notice kind="error">{error}{!forbidden && <Button size="sm" variant="ghost" onClick={() => void load()}>Tentar novamente</Button>}</Notice>}
      {!forbidden && <>
      <section aria-label="Resumo geral do staff" className="space-y-2"><p className="text-xs text-slate-500">Visão geral de toda a equipe · independente dos filtros da lista</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <button type="button" aria-label="Mostrar todo o staff" className="rounded-xl text-left [&>div]:h-full" onClick={clear}><StatCard title="Total da equipe" value={data?.overview.total ?? "—"} hint="Todos os acessos de staff" icon={<Users className="h-4 w-4" />} /></button>
        <button type="button" aria-label="Filtrar staff ativo" aria-pressed={query.status === "active"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 [&>div]:h-full" onClick={() => change("status", query.status === "active" ? "" : "active")}><StatCard title="Ativos" value={data?.overview.active ?? "—"} hint="Contas habilitadas" icon={<UserCheck className="h-4 w-4" />} accent="emerald" /></button>
        <button type="button" aria-label="Filtrar staff inativo" aria-pressed={query.status === "inactive"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 [&>div]:h-full" onClick={() => change("status", query.status === "inactive" ? "" : "inactive")}><StatCard title="Inativos" value={data?.overview.inactive ?? "—"} hint="Contas sem acesso" icon={<UserX className="h-4 w-4" />} accent="rose" /></button>
        <button type="button" aria-label="Filtrar administradores" aria-pressed={query.role === "admin"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 [&>div]:h-full" onClick={() => change("role", query.role === "admin" ? "" : "admin")}><StatCard title="Administradores" value={data?.overview.admin ?? "—"} hint="Papel de administrador" accent="violet" /></button>
        <button type="button" aria-label="Filtrar superusuários" aria-pressed={query.role === "superuser"} className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 [&>div]:h-full" onClick={() => change("role", query.role === "superuser" ? "" : "superuser")}><StatCard title="Superusuários" value={data?.overview.superuser ?? "—"} hint="Acesso privilegiado" icon={<ShieldCheck className="h-4 w-4" />} accent="amber" /></button>
      </div></section>
      <FilterBar active={hasFilters} onClear={clear}><div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="staff-search">Buscar staff</Label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="staff-search" value={query.search} onChange={event => change("search", event.target.value)} placeholder="Nome, usuário ou e-mail" className="pl-9" /></div></div><AdminFilterSelect id="staff-status-filter" label="Acesso" value={query.status} options={[["all", "Todos os acessos"], ["active", "Ativos"], ["inactive", "Inativos"]]} onChange={value => change("status", value)} /><AdminFilterSelect id="staff-role-filter" label="Papel" value={query.role} options={[["all", "Todos os papéis"], ["superuser", "Superusuário"], ...Object.entries(roleLabels)]} onChange={value => change("role", value)} /></FilterBar>
      <ListToolbar count={data?.count || 0} loading={loading} ordering={query.ordering} onOrderingChange={value => change("ordering", value)} options={[{value: "name", label: "Usuário (A–Z)"}, {value: "-date_joined", label: "Mais recentes"}, {value: "-last_login", label: "Último login"}]} />

      <Card className="overflow-hidden">
        <Table aria-label="Lista de staff" className="min-w-[800px]">
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>Usuário</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Papel</TableHead>
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
            {!loading && !error && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={<ShieldOff className="h-5 w-5" />}
                    title={hasFilters ? "Nenhum staff corresponde aos filtros" : "Nenhum usuário staff"}
                    description={hasFilters ? "Ajuste a busca ou limpe os filtros." : "Crie o primeiro usuário staff para começar."}
                  /><div className="flex justify-center pb-6"><Button variant="outline" onClick={hasFilters ? clear : openCreate}>{hasFilters ? "Limpar filtros" : "Novo staff"}</Button></div>
                </TableCell>
              </TableRow>
            )}
            {!loading && !error &&
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
                    {user.is_superuser ? <BadgeViolet>Superusuário</BadgeViolet> : <BadgeViolet>{roleLabels[user.roles?.[0]] || "Sem papel"}</BadgeViolet>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.is_active ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {user.last_login ? formatDate(user.last_login) : "Nunca acessou"}
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

      <ListPagination count={data?.count || 0} page={Number(query.page)} pageSize={Number(query.page_size)} disabled={loading} onPageChange={value => change("page", String(value))} onPageSizeChange={value => change("page_size", String(value))} />
      </>}
      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={open => { if (!creating) { setCreateOpen(open); if (!open) setCreateForm(emptyCreate); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo usuário staff</DialogTitle>
            <DialogDescription>
              Crie um usuário com acesso à área administrativa. A senha deve ter ao menos 8 caracteres.
            </DialogDescription>
          </DialogHeader>
          {formError && <Notice kind="error">{formError}</Notice>}
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
            <AdminFilterSelect id="staff-role" label="Papel administrativo" value={createForm.role} options={Object.entries(roleLabels)} disabled={creating} onChange={value => setCreateForm({...createForm, role: value as typeof createForm.role})} />
            <div className="space-y-2">
              <Label htmlFor="staff-password">Senha *</Label>
              <Input
                id="staff-password"
                type="password"
                minLength={8}
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
              disabled={creating || !createForm.username || createForm.password.length < 8}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editing && (
        <Dialog open={editOpen} onOpenChange={open => { if (busy === null) setEditOpen(open); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar staff — {editing.username}</DialogTitle>
              <DialogDescription>
                Altere os dados e permissões do usuário.
              </DialogDescription>
            </DialogHeader>
            {formError && <Notice kind="error">{formError}</Notice>}
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
              {!editing.is_superuser && editing.id !== me?.id && <AdminFilterSelect id="edit-role" label="Papel administrativo" value={editing.roles?.[0] || "reviewer"} options={Object.entries(roleLabels)} disabled={busy !== null} onChange={value => setEditing({...editing, roles: [value as "admin" | "editor" | "reviewer"]})} />}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Acesso de staff</p>
                  <p className="text-xs text-slate-500">Permite acesso à área administrativa.</p>
                </div>
                <Switch
                  disabled={editing.id === me?.id || busy !== null}
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
                  disabled={editing.id === me?.id || busy !== null}
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
