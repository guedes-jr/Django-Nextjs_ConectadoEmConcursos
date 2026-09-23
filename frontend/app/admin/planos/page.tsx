"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { backoffice, Plan, PlanPayload } from "@/lib/backoffice";

type BlankPlan = {
  slug: string;
  name: string;
  monthly_price: string;
  semiannual_price: string;
  annual_price: string;
  features: string;
};

const blank: BlankPlan = { slug: "", name: "", monthly_price: "", semiannual_price: "", annual_price: "", features: "" };

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [form, setForm] = useState<BlankPlan>(blank);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await backoffice.listPlans();
      setPlans(res.results);
    } catch {
      setError("Não foi possível carregar os planos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string, isError = false) => {
    setNotice(isError ? null : message);
    setError(isError ? message : null);
  };

  const toggle = async (plan: Plan) => {
    setBusy(true);
    try {
      await backoffice.updatePlan(plan.id, { is_active: !plan.is_active });
      flash(plan.is_active ? "Plano desativado." : "Plano ativado.");
      void load();
    } catch {
      flash("Falha ao atualizar o plano.", true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (plan: Plan) => {
    if (!window.confirm(`Excluir o plano "${plan.name}"?`)) return;
    setBusy(true);
    try {
      await backoffice.deletePlan(plan.id);
      flash("Plano excluído.");
      void load();
    } catch (err: any) {
      flash(err?.response?.data?.detail ?? "Não foi possível excluir.", true);
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: PlanPayload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        monthly_price: form.monthly_price || 0,
        semiannual_price: form.semiannual_price || 0,
        annual_price: form.annual_price || 0,
        features: form.features.split(",").map((f) => f.trim()).filter(Boolean),
      };
      await backoffice.createPlan(payload);
      setForm(blank);
      flash("Plano criado.");
      void load();
    } catch (err: any) {
      const detail = err?.response?.data;
      flash(typeof detail === "string" ? detail : "Falha ao criar o plano.", true);
    } finally {
      setBusy(false);
    }
  };

  const brl = (value: string | number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Planos</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Crie, edite e desative planos de assinatura.</p>
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

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Plano</th>
                <th className="px-5 py-3 font-semibold">Mensal</th>
                <th className="px-5 py-3 font-semibold">Semestral</th>
                <th className="px-5 py-3 font-semibold">Anual</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr><td colSpan={6} className="px-5 py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" /></td></tr>
              )}
              {!loading && plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{plan.name}</p>
                    <p className="text-xs text-slate-500">{plan.slug} · {plan.features.length} recursos</p>
                  </td>
                  <td className="px-5 py-3">{brl(plan.monthly_price)}</td>
                  <td className="px-5 py-3">{brl(plan.semiannual_price)}</td>
                  <td className="px-5 py-3">{brl(plan.annual_price)}</td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(plan)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${plan.is_active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {plan.is_active ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(plan)}
                      className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      aria-label={`Excluir ${plan.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={create} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Plus size={18} className="text-indigo-500" /> Novo plano
          </h2>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">Slug</span>
            <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" placeholder="ex.: padrao" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">Nome</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" placeholder="ex.: Padrão" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(["monthly_price", "semiannual_price", "annual_price"] as const).map((field) => (
              <label key={field} className="block text-sm">
                <span className="mb-1 block text-slate-500">{field === "monthly_price" ? "Mensal" : field === "semiannual_price" ? "Semestral" : "Anual"}</span>
                <input required type="number" step="0.01" min="0" value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" placeholder="0,00" />
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">Recursos (separados por vírgula)</span>
            <textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} rows={3} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" placeholder="Ex.: Sem limites de questões, Provas comentadas" />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Criar plano"}
          </button>
        </form>
      </section>
    </div>
  );
}