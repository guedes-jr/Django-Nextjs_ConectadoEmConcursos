"use client";

import Link from "next/link";
import {ResetUserPassword} from "@/components/admin/ResetUserPassword";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, ShieldCheck, UserPlus, Pencil, Users, UserCheck, UserX, CalendarPlus, CreditCard, Loader2 } from "lucide-react";
import { backoffice, UserRow, Plan, formatDate, cycleLabel } from "@/lib/backoffice";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { FloatingNotice } from "@/components/admin/FloatingNotice";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { FilterBar, ListToolbar, ListPagination } from "@/components/admin/ListControls";

type Filters = { search: string; status: string; subscription: string; activity: string; registered: string; ordering: string; page: number; page_size: number };
const defaults: Filters = { search: "", status: "", subscription: "", activity: "", registered: "", ordering: "-date_joined", page: 1, page_size: 12 };
const emptyUser = { username: "", email: "", first_name: "", last_name: "", password: "" };
type Summary = Awaited<ReturnType<typeof backoffice.usersOverview>>;

function errorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data || typeof data !== "object") return fallback;
  return Object.entries(data).map(([field, value]) => `${field === "detail" ? "" : `${({username: "Usuário", email: "E-mail", password: "Senha", reason: "Motivo"} as Record<string, string>)[field] || field}: `}${Array.isArray(value) ? value.join(" ") : value}`).join(" · ") || fallback;
}

function FilterSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label><Select value={value || "all"} onValueChange={next => onChange(next === "all" ? "" : next)}><SelectTrigger id={id} className="w-full xl:w-48"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [filters, setFilters] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);
  const mutationBusy = useRef(false);
  const [actionUser, setActionUser] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState(emptyUser);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pickerUser, setPickerUser] = useState<UserRow | null>(null);
  const [pickerPlan, setPickerPlan] = useState("");
  const [pickerCycle, setPickerCycle] = useState("mensal");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const choice = (key: string, allowed: string[], fallback = "") => allowed.includes(params.get(key) || "") ? params.get(key)! : fallback;
      const page = Number(params.get("page"));
      setFilters({ search: params.get("search") || "", status: choice("status", ["active", "blocked"]), subscription: choice("subscription", ["active", "valid", "pending_payment", "canceled", "none"]), activity: choice("activity", ["active", "inactive"]), registered: choice("registered", ["recent"]), ordering: choice("ordering", ["name", "date_joined", "-last_login"], "-date_joined"), page: Number.isSafeInteger(page) && page > 0 ? page : 1, page_size: [12, 24, 48].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 12 });
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const loadSummary = useCallback(async () => {
    try { setSummary(await backoffice.usersOverview()); setSummaryError(false); }
    catch { setSummaryError(true); }
  }, []);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const loadRows = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const result = await backoffice.listUsers(filters);
      if (id !== requestId.current) return;
      setRows(result.results); setTotal(result.total);
      if (result.page !== filters.page) setFilters(current => ({ ...current, page: result.page }));
    } catch (err) { if (id === requestId.current) setError(errorMessage(err, "Não foi possível carregar os usuários.")); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [filters]);

  useEffect(() => {
    if (!ready) return;
    const sequence = requestId;
    ++sequence.current;
    setLoading(true);
    const params = new URLSearchParams(window.location.search);
    Object.entries(filters).forEach(([key, value]) => value === defaults[key as keyof Filters] ? params.delete(key) : params.set(key, String(value)));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    const timer = window.setTimeout(() => void loadRows(), 300);
    return () => { window.clearTimeout(timer); ++sequence.current; };
  }, [ready, filters, loadRows]);

  const changeFilter = (key: keyof Filters, value: string | number) => setFilters(current => ({ ...current, [key]: value, page: 1 }));
  const hasFilters = Boolean(filters.search || filters.status || filters.subscription || filters.activity || filters.registered);
  const clearFilters = () => setFilters(current => ({ ...defaults, ordering: current.ordering, page_size: current.page_size }));
  const reload = () => { void loadRows(); void loadSummary(); };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mutationBusy.current) return;
    mutationBusy.current = true; setCreating(true); setCreateError(null);
    try {
      const user = await backoffice.createUser(newUser);
      setCreateOpen(false); setNewUser(emptyUser); setNotice(`Usuário ${user.username} criado.`); reload();
    } catch (err) { setCreateError(errorMessage(err, "Não foi possível criar o usuário.")); }
    finally { mutationBusy.current = false; setCreating(false); }
  };

  const toggleActive = async () => {
    if (!actionUser || mutationBusy.current) return;
    mutationBusy.current = true; setBusy(actionUser.id); setActionError(null);
    try {
      await backoffice.userAction(actionUser.id, actionUser.is_active ? "block" : "unblock", reason);
      setNotice(`${actionUser.username} ${actionUser.is_active ? "bloqueado" : "desbloqueado"}.`);
      setActionUser(null); reload();
    } catch (err) { setActionError(errorMessage(err, "Falha ao atualizar o acesso.")); }
    finally { mutationBusy.current = false; setBusy(null); }
  };

  const loadPlans = useCallback(async () => {
    setPlansLoading(true); setPickerError(null);
    try { setPlans((await backoffice.listPlans()).results); }
    catch { setPickerError("Não foi possível carregar os planos. Tente novamente."); }
    finally { setPlansLoading(false); }
  }, []);
  const openPicker = (user: UserRow) => {
    setPickerUser(user); setPickerPlan(user.subscription?.plan_slug || ""); setPickerCycle(user.subscription?.cycle || "mensal");
    void loadPlans();
  };
  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pickerUser || !pickerPlan || mutationBusy.current) return;
    mutationBusy.current = true; setBusy(pickerUser.id); setPickerError(null);
    try { await backoffice.assignSubscription(pickerUser.id, pickerPlan, pickerCycle); setPickerUser(null); setNotice("Assinatura atribuída."); reload(); }
    catch (err) { setPickerError(errorMessage(err, "Falha ao atribuir a assinatura.")); }
    finally { mutationBusy.current = false; setBusy(null); }
  };

  return <div className="space-y-6">
    <PageHeader title="Usuários" description="Acompanhe os cadastros, gerencie acessos e organize assinaturas." actions={<Button onClick={() => { setNewUser(emptyUser); setCreateError(null); setCreateOpen(true); }} className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"><UserPlus className="h-4 w-4" /> Novo usuário</Button>} />
    <FloatingNotice message={notice} onDismiss={() => setNotice(null)} />
    {summaryError && <Notice kind="error">Não foi possível atualizar os indicadores. <Button variant="ghost" size="sm" onClick={() => void loadSummary()}>Tentar novamente</Button></Notice>}
    <section aria-label="Resumo geral dos usuários" className="space-y-2">
      <p className="text-xs text-slate-500">Visão geral de todos os usuários · independente dos filtros da lista</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <button type="button" className="rounded-xl text-left focus-visible:outline-2 focus-visible:outline-indigo-500" aria-label="Mostrar todos os usuários" onClick={clearFilters}><StatCard title="Total de usuários" value={summary?.total ?? "—"} hint="Ver todos os cadastros" icon={<Users className="h-4 w-4" />} /></button>
        <button type="button" className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" aria-label="Filtrar usuários com acesso liberado" aria-pressed={filters.status === "active"} onClick={() => changeFilter("status", filters.status === "active" ? "" : "active")}><StatCard title="Acessos liberados" value={summary?.active ?? "—"} hint="Contas habilitadas" accent="emerald" icon={<UserCheck className="h-4 w-4" />} /></button>
        <button type="button" className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" aria-label="Filtrar usuários bloqueados" aria-pressed={filters.status === "blocked"} onClick={() => changeFilter("status", filters.status === "blocked" ? "" : "blocked")}><StatCard title="Bloqueados" value={summary?.blocked ?? "—"} hint="Contas sem acesso" accent="rose" icon={<UserX className="h-4 w-4" />} /></button>
        <button type="button" className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" aria-label="Filtrar novos usuários em 30 dias" aria-pressed={filters.registered === "recent"} onClick={() => changeFilter("registered", filters.registered ? "" : "recent")}><StatCard title="Novos em 30 dias" value={summary?.new_30_days ?? "—"} hint="Cadastros recentes" accent="sky" icon={<CalendarPlus className="h-4 w-4" />} /></button>
        <button type="button" className="rounded-xl text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500" aria-label="Filtrar usuários com assinatura vigente" aria-pressed={filters.subscription === "valid"} onClick={() => changeFilter("subscription", filters.subscription === "valid" ? "" : "valid")}><StatCard title="Assinaturas vigentes" value={summary?.valid_subscriptions ?? "—"} hint="Inclui planos gratuitos" accent="violet" icon={<CreditCard className="h-4 w-4" />} /></button>
      </div>
    </section>
    <FilterBar active={hasFilters} onClear={clearFilters}>
      <div className="min-w-0 space-y-2 xl:min-w-64 xl:flex-1"><Label htmlFor="user-search">Buscar usuários</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="user-search" value={filters.search} onChange={event => changeFilter("search", event.target.value)} placeholder="Nome, usuário ou e-mail" className="pl-9" /></div></div>
      <FilterSelect id="user-access" label="Acesso" value={filters.status} onChange={value => changeFilter("status", value)} options={[["all", "Todos os acessos"], ["active", "Liberados"], ["blocked", "Bloqueados"]]} />
      <FilterSelect id="user-subscription" label="Assinatura" value={filters.subscription} onChange={value => changeFilter("subscription", value)} options={[["all", "Todas as assinaturas"], ["valid", "Vigentes"], ["active", "Status ativo"], ["pending_payment", "Pagamento pendente"], ["canceled", "Canceladas"], ["none", "Sem assinatura"]]} />
      <FilterSelect id="user-activity" label="Atividade em 30 dias" value={filters.activity} onChange={value => changeFilter("activity", value)} options={[["all", "Qualquer atividade"], ["active", "Com registro"], ["inactive", "Sem registro"]]} />
      <FilterSelect id="user-registration" label="Cadastro" value={filters.registered} onChange={value => changeFilter("registered", value)} options={[["all", "Qualquer data"], ["recent", "Últimos 30 dias"]]} />
    </FilterBar>
    <ListToolbar count={total} loading={loading} ordering={filters.ordering} onOrderingChange={value => changeFilter("ordering", value)} options={[{value: "-date_joined", label: "Mais recentes"}, {value: "date_joined", label: "Mais antigos"}, {value: "name", label: "Usuário (A–Z)"}, {value: "-last_login", label: "Último login"}]} />
    {error && <Notice kind="error">{error} <Button variant="ghost" size="sm" onClick={() => void loadRows()}>Tentar novamente</Button></Notice>}
    <Card className="min-w-0 overflow-hidden">
      <Table aria-label="Lista de usuários">
        <TableHeader className="bg-slate-50 dark:bg-slate-800/50"><TableRow className="hover:bg-transparent"><TableHead>Usuário</TableHead><TableHead>Assinatura</TableHead><TableHead>Cadastro</TableHead><TableHead>Último login</TableHead><TableHead>Acesso</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {loading && <TableRow><TableCell colSpan={6}><LoadingState label="Carregando usuários..." /></TableCell></TableRow>}
          {!loading && !error && rows.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title={hasFilters ? "Nenhum usuário corresponde aos filtros" : "Nenhum usuário cadastrado"} description={hasFilters ? "Experimente outro termo ou limpe os filtros." : "Adicione o primeiro usuário para começar."} /><div className="flex justify-center pb-6"><Button variant="outline" onClick={hasFilters ? clearFilters : () => { setNewUser(emptyUser); setCreateError(null); setCreateOpen(true); }}>{hasFilters ? "Limpar filtros" : "Criar primeiro usuário"}</Button></div></TableCell></TableRow>}
          {!loading && !error && rows.map(user => <TableRow key={user.id}>
            <TableCell><Link href={`/admin/usuarios/${user.id}`} className="inline-flex items-center gap-1.5 font-medium text-slate-800 hover:underline dark:text-slate-100">{user.username}{user.is_staff && <ShieldCheck className="h-3.5 w-3.5 text-violet-500" aria-label="Equipe administrativa" />}</Link>{(user.first_name || user.last_name) && <p className="text-xs text-slate-500">{[user.first_name, user.last_name].filter(Boolean).join(" ")}</p>}<p className="text-xs text-slate-500">{user.email || "Sem e-mail"}</p></TableCell>
            <TableCell>{user.subscription ? <div className="flex items-center gap-2"><div><p className="text-sm">{user.subscription.plan}</p><StatusBadge status={user.subscription.status} /></div><Button variant="ghost" size="icon" disabled={busy !== null} onClick={() => openPicker(user)} aria-label={`Editar assinatura de ${user.username}`}><Pencil className="h-3.5 w-3.5" /></Button></div> : <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => openPicker(user)}>Atribuir plano</Button>}</TableCell>
            <TableCell className="whitespace-nowrap text-slate-500">{formatDate(user.date_joined)}</TableCell>
            <TableCell className="whitespace-nowrap text-slate-500">{user.last_login ? formatDate(user.last_login) : "Nunca acessou"}</TableCell>
            <TableCell><StatusBadge status={user.is_active ? "active" : "blocked"} /></TableCell>
            <TableCell><div className="flex justify-end gap-2"><ResetUserPassword user={user} disabled={busy!==null} onSuccess={()=>setNotice(`Senha de ${user.username} redefinida. Os acessos anteriores foram encerrados.`)}/><Button asChild variant="outline" size="sm"><Link href={`/admin/usuarios/${user.id}`}>Gerenciar</Link></Button><Button variant={user.is_active ? "ghost" : "secondary"} size="sm" disabled={busy !== null} onClick={() => { setActionUser(user); setReason(""); setActionError(null); }}>{busy === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : user.is_active ? "Bloquear" : "Desbloquear"}</Button></div></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </Card>
    <ListPagination count={total} page={filters.page} pageSize={filters.page_size} disabled={loading} onPageChange={page => setFilters(current => ({ ...current, page }))} onPageSizeChange={value => changeFilter("page_size", value)} />

    <Dialog open={createOpen} onOpenChange={open => { if (!creating) { setCreateOpen(open); if (!open) setNewUser(emptyUser); } }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Novo usuário</DialogTitle><DialogDescription>Crie uma conta comum. Nenhum e-mail é enviado automaticamente e o cadastro não concede acesso administrativo.</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-4">{createError && <Notice kind="error">{createError}</Notice>}<div className="grid gap-3 sm:grid-cols-2">{([["first_name", "Nome"], ["last_name", "Sobrenome"], ["username", "Nome de usuário"], ["email", "E-mail"], ["password", "Senha inicial"]] as const).map(([key, label]) => <div key={key} className={key === "password" ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label htmlFor={`new-user-${key}`}>{label}{["username", "email", "password"].includes(key) ? " *" : ""}</Label><Input id={`new-user-${key}`} type={key === "email" ? "email" : key === "password" ? "password" : "text"} autoComplete={key === "password" ? "new-password" : "off"} value={newUser[key]} onChange={event => setNewUser(current => ({...current, [key]: event.target.value}))} required={["username", "email", "password"].includes(key)} maxLength={key === "email" ? 254 : key === "password" ? undefined : 150} disabled={creating} /></div>)}</div><p className="text-xs text-slate-500">A senha deve atender à política de segurança da plataforma. O e-mail permanece sem verificação.</p><DialogFooter><Button type="button" variant="outline" onClick={() => { setCreateOpen(false); setNewUser(emptyUser); }} disabled={creating}>Cancelar</Button><Button type="submit" disabled={creating}>{creating && <Loader2 className="h-4 w-4 animate-spin" />}Criar usuário</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={!!actionUser} onOpenChange={open => { if (!open && busy === null) setActionUser(null); }}><DialogContent><DialogHeader><DialogTitle>{actionUser?.is_active ? "Bloquear usuário" : "Desbloquear usuário"}</DialogTitle><DialogDescription>{actionUser?.is_active ? `Bloquear ${actionUser.username} impede novos acessos à conta e preserva seu histórico.` : `Restaurar o acesso de ${actionUser?.username} à plataforma.`}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); void toggleActive(); }} className="space-y-4">{actionError && <Notice kind="error">{actionError}</Notice>}{actionUser?.is_active && <div className="space-y-2"><Label htmlFor="block-reason">Motivo do bloqueio</Label><Input id="block-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required disabled={busy !== null} /></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setActionUser(null)} disabled={busy !== null}>Cancelar</Button><Button type="submit" variant={actionUser?.is_active ? "destructive" : "default"} disabled={busy !== null || Boolean(actionUser?.is_active && !reason.trim())}>{busy !== null && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar {actionUser?.is_active ? "bloqueio" : "desbloqueio"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={!!pickerUser} onOpenChange={open => { if (!open && busy === null) setPickerUser(null); }}><DialogContent><DialogHeader><DialogTitle>{pickerUser?.subscription ? "Editar assinatura" : "Atribuir assinatura"}</DialogTitle><DialogDescription>Gerencie o plano de {pickerUser?.username}. Contratos gerenciados por um provedor podem exigir alteração no próprio provedor.</DialogDescription></DialogHeader><form onSubmit={assign} className="space-y-4">{pickerError && <Notice kind="error">{pickerError} <Button type="button" size="sm" variant="ghost" onClick={() => void loadPlans()} disabled={plansLoading}>Recarregar planos</Button></Notice>}{plansLoading ? <LoadingState label="Carregando planos..." /> : <><div className="space-y-2"><Label htmlFor="assign-plan">Plano</Label><Select value={pickerPlan} onValueChange={setPickerPlan} required disabled={busy !== null}><SelectTrigger id="assign-plan"><SelectValue placeholder="Selecione o plano" /></SelectTrigger><SelectContent>{plans.map(plan => <SelectItem key={plan.id} value={plan.slug}>{plan.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="assign-cycle">Ciclo</Label><Select value={pickerCycle} onValueChange={setPickerCycle} disabled={busy !== null}><SelectTrigger id="assign-cycle"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cycleLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></>}<DialogFooter><Button type="button" variant="outline" onClick={() => setPickerUser(null)} disabled={busy !== null}>Cancelar</Button><Button type="submit" disabled={busy !== null || !pickerPlan || plansLoading || !plans.some(plan => plan.slug === pickerPlan)}>{busy !== null && <Loader2 className="h-4 w-4 animate-spin" />}Salvar assinatura</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
