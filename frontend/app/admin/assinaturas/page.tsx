"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, AlertTriangle, Check } from "lucide-react";
import { backoffice, SubscriptionRow, Plan, formatDate, statusColor, statusLabel, cycleLabel } from "@/lib/backoffice";

const statusTabs = [
  { value: "", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "pending_payment", label: "Pagamento pendente" },
  { value: "canceled", label: "Canceladas" },
];

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subs, allPlans] = await Promise.all([
        backoffice.listSubscriptions({ status, search }),
        backoffice.listPlans(),
      ]);
      setRows(subs.results);
      setPlans(allPlans.results);
    } catch {
      setError("Não foi possível carregar as assinaturas.");
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, status, load]);

  const update = async (id: number, data: Parameters<typeof backoffice.updateSubscription>[1]) => {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await backoffice.updateSubscription(id, data);
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
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Assinaturas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ative, cancele ou troque o plano de cada usuário.</p>
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

      <section className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuário ou e-mail..."
            className="w-64 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-800">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                status === tab.value
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Usuário</th>
                <th className="px-5 py-3 font-semibold">Plano</th>
                <th className="px-5 py-3 font-semibold">Ciclo</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Criada em</th>
                <th className="px-5 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr><td colSpan={6} className="px-5 py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Nenhuma assinatura encontrada.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{row.username}</p>
                    <p className="text-xs text-slate-500">{row.email || "sem e-mail"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={row.plan_slug}
                      disabled={busy === row.id}
                      onChange={(e) => update(row.id, { plan_slug: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.slug}>{plan.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={row.cycle}
                      disabled={busy === row.id}
                      onChange={(e) => update(row.id, { cycle: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      {Object.entries(cycleLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {statusLabel[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(row.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      {row.status !== "active" && (
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => update(row.id, { status: "active" })}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Ativar
                        </button>
                      )}
                      {row.status !== "canceled" && (
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => update(row.id, { status: "canceled" })}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}