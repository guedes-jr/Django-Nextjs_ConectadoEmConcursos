"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { backoffice, UserRow, Plan, formatDate, statusColor, statusLabel, cycleLabel } from "@/lib/backoffice";

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ user: UserRow; plan: string; cycle: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [users, allPlans] = await Promise.all([
        backoffice.listUsers({ search }),
        backoffice.listPlans(),
      ]);
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
      setNotice(user.is_active ? "Usuário desativado." : "Usuário ativado.");
      void load();
    } catch {
      setError("Falha ao atualizar o usuário.");
    } finally {
      setBusy(null);
    }
  };

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picker) return;
    setBusy(picker.user.id);
    setError(null);
    setNotice(null);
    try {
      await backoffice.assignSubscription(picker.user.id, picker.plan, picker.cycle);
      setPicker(null);
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
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Usuários</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Busque, ative/desative e atribua assinaturas.</p>
        </div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-64 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </section>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Usuário</th>
                <th className="px-5 py-3 font-semibold">Assinatura</th>
                <th className="px-5 py-3 font-semibold">Registrado em</th>
                <th className="px-5 py-3 font-semibold">Acesso</th>
                <th className="px-5 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr><td colSpan={5} className="px-5 py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Nenhum usuário encontrado.</td></tr>
              )}
              {!loading && rows.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3">
                    <p className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                      {user.username}
                      {user.is_staff && <ShieldCheck size={15} className="text-violet-500" aria-label="Staff" />}
                    </p>
                    <p className="text-xs text-slate-500">{user.email || "sem e-mail"}</p>
                  </td>
                  <td className="px-5 py-3">
                    {user.subscription ? (
                      <div>
                        <p className="text-slate-700 dark:text-slate-200">{user.subscription.plan}</p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[user.subscription.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {statusLabel[user.subscription.status] ?? user.subscription.status}
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPicker({ user, plan: "", cycle: "mensal" })}
                        className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Atribuir plano
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(user.date_joined)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.is_active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"}`}
                    >
                      {user.is_active ? "Ativo" : "Bloqueado"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy === user.id}
                      onClick={() => toggleActive(user)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        user.is_active
                          ? "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                      }`}
                    >
                      {user.is_active ? "Bloquear" : "Desbloquear"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {picker && (
        <form onSubmit={assign} className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Atribuir assinatura para <span className="text-indigo-600 dark:text-indigo-400">{picker.user.username}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <select
              required
              value={picker.plan}
              onChange={(e) => setPicker({ ...picker, plan: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>Selecione o plano</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.slug}>{plan.name}</option>
              ))}
            </select>
            <select
              value={picker.cycle}
              onChange={(e) => setPicker({ ...picker, cycle: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {Object.entries(cycleLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="submit" disabled={busy === picker.user.id} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              Salvar
            </button>
            <button type="button" onClick={() => setPicker(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}