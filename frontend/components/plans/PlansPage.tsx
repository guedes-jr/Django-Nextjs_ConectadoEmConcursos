"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Accent, BillingCycle, Plan } from "@/types/plans";
import { FAQS } from "@/lib/mocks/faqs";
import { cancelSubscription, expireCheckout, getSubscription, listPlans, selectPlan, Subscription } from "@/lib/plans";
import BillingToggle from "@/components/plans/BillingToggle";
import PlanCard from "@/components/plans/PlanCard";
import FAQ from "@/components/plans/FAQ";
import WhoWeAre from "@/components/plans/WhoWeAre";

function errorMessage(error: unknown) {
  if (isAxiosError(error) && typeof error.response?.data?.detail === "string") return error.response.data.detail;
  return "Não foi possível concluir a solicitação. Tente novamente.";
}

export default function PlansPage() {
  const [cycle, setCycle] = useState<BillingCycle>("mensal");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (checkout === "success") setMessage("Checkout concluído. Aguarde a confirmação do pagamento e atualize o status da assinatura.");
    if (checkout === "canceled") setMessage("Você saiu do checkout. Pode retomar a contratação ou encerrar o checkout pendente abaixo.");
    void Promise.all([listPlans(), getSubscription()])
      .then(([items, current]) => {
        setSubscription(current);
        setPlans(items.map((item, index) => ({
          key: item.slug,
          title: item.name,
          accent: (["slate", "teal", "blue"] as Accent[])[index] ?? "blue",
          price: { mensal: Number(item.prices.mensal), semestral: Number(item.prices.semestral), anual: Number(item.prices.anual) },
          periodLabel: { mensal: "/ mês", semestral: "/ 6 meses", anual: "/ ano" },
          cta: { label: item.slug === "gratis" ? "Selecionar" : "Assinar" },
          features: item.features.map((label) => ({ label, included: true })),
        })));
      })
      .catch(() => setMessage("Não foi possível carregar os planos agora."));
  }, []);

  async function choose(plan: Plan) {
    setLoadingPlan(plan.key);
    setMessage(null);
    try {
      const result = await selectPlan(plan.key, cycle);
      setSubscription(result.subscription);
      setMessage(result.detail ?? "Plano atualizado com sucesso.");
      if (result.checkout_url) {
        const url = new URL(result.checkout_url);
        if (url.protocol === "https:" && url.hostname === "checkout.stripe.com") window.location.assign(url.href);
        else setMessage("Endereço de checkout inválido. Contate o suporte.");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoadingPlan(null);
    }
  }

  async function manage(action: "refresh" | "cancel" | "expire") {
    setRefreshing(true);
    try {
      if (action === "cancel") {
        setSubscription(await cancelSubscription());
        setMessage("Renovação cancelada. Seu acesso continua até o fim do período pago.");
      } else {
        if (action === "expire") await expireCheckout();
        setSubscription(await getSubscription());
        setMessage(action === "expire" ? "Checkout pendente encerrado." : "Status da assinatura atualizado.");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  const busy = refreshing || loadingPlan !== null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <div className="text-center">
          <p className="text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
            Planos e Assinatura
          </p>

          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Escolha um dos nossos planos
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 sm:text-base">
            Acelere sua aprovação com acesso total à nossa plataforma.
          </p>

          <BillingToggle value={cycle} onChange={setCycle} />
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-6 lg:flex-row lg:items-stretch">
          {plans.map((p) => (
            <PlanCard key={p.key} plan={p} cycle={cycle} onSelect={() => void choose(p)} selected={subscription?.plan?.slug === p.key && subscription?.access_active} loading={loadingPlan === p.key} disabled={busy} />
          ))}
        </div>

        <section aria-label="Sua assinatura" className="mx-auto mt-8 max-w-2xl rounded-xl bg-white p-5 text-sm shadow-sm dark:bg-slate-900">
          <p className="font-semibold">Sua assinatura: {subscription?.plan?.name ?? "Sem assinatura contratada"}</p>
          {subscription && <p className="mt-2">{subscription.access_active ? "Acesso ativo" : subscription.status === "canceled" ? "Assinatura encerrada" : "Sem acesso pago confirmado"}
            {subscription.current_period_end && ` · Período pago até ${new Date(subscription.current_period_end).toLocaleString("pt-BR")}`}
          </p>}
          {subscription?.cancel_at_period_end && <p className="mt-2">Renovação automática cancelada.</p>}
          {subscription?.provider_status === "past_due" && <p className="mt-2">A renovação está com pagamento pendente.</p>}
          <div className="mt-4 flex flex-wrap gap-4">
            <button type="button" disabled={busy} className="underline disabled:opacity-50" onClick={() => void manage("refresh")}>Atualizar status</button>
            <button type="button" disabled={busy} className="underline disabled:opacity-50" onClick={() => void manage("expire")}>Encerrar checkout pendente</button>
            {subscription?.gateway === "stripe" && !subscription.cancel_at_period_end && !["canceled", "incomplete_expired"].includes(subscription.provider_status) && (
              <button type="button" disabled={busy} className="underline disabled:opacity-50" onClick={() => void manage("cancel")}>Cancelar renovação automática</button>
            )}
          </div>
        </section>

        {message && <p role="status" className="mx-auto mt-6 max-w-2xl rounded-xl bg-blue-50 p-4 text-center text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-white px-6 py-5 text-center text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-800">
          Escolha entre <span className="font-semibold">cobrança mensal</span>,{" "}
          <span className="font-semibold">semestral</span> com desconto ou{" "}
          <span className="font-semibold">anual</span> com desconto maior. Você
          pode cancelar sua assinatura a qualquer momento e continuar usando até
          o final do período já pago.
        </div>

        <div className="mt-14 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sua dúvida não está aqui?{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              Fale com a gente
            </span>
          </p>
        </div>

        <FAQ items={FAQS} />

        <div className="mt-16">
          <WhoWeAre />
        </div>
      </section>
    </main>
  );
}
