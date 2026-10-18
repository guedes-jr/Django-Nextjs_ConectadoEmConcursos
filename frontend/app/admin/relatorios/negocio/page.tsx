"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { businessReports, BusinessReport, FinancialMetrics, ReportParams } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";

const labels: Record<string, string> = {
  mrr: "MRR atual", arr: "ARR atual", active_subscriptions: "Assinaturas pagas vigentes", recurring_subscriptions: "Assinaturas com renovação", scheduled_cancellations: "Cancelamentos agendados", past_due_subscriptions: "Assinaturas em atraso", new_paid_subscriptions: "Novas contratações confirmadas", pending_checkouts: "Checkouts aguardando confirmação", pending_subscriptions: "Assinaturas pendentes", canceled_subscriptions: "Cancelamentos efetivados", received_revenue: "Receita confirmada registrada", previous_received_revenue: "Receita no período anterior", received_revenue_change_percent: "Variação de receita", payments_count: "Recibos pagos incluídos", previous_payments_count: "Recibos no período anterior", average_ticket_received: "Ticket médio recebido", average_ticket_mrr: "MRR médio por assinatura", reactivations: "Reativações (fonte indisponível)", new_users: "Novos cadastros", previous_new_users: "Cadastros no período anterior", new_users_change_percent: "Crescimento de cadastros", active_users: "Usuários ativos", dau: "DAU", wau: "WAU", mau: "MAU", activation_rate_percent: "Taxa de ativação", signup_to_active_subscription_percent: "Cadastro → assinatura ativa", questions_answered: "Questões respondidas", correct_answers: "Acertos", correct_rate_percent: "Taxa de acerto", study_sessions: "Sessões de estudo", study_minutes: "Minutos estudados", simulations_finished: "Simulados concluídos", flashcards_created: "Flashcards criados", chat_queries: "Consultas ao chat", questions_pending: "Questões na fila", questions_approved: "Questões aprovadas", questions_rejected: "Questões rejeitadas", queue_average_age_hours: "Idade média da fila (h)", payments_received: "Pagamentos iniciais registrados", payments_failed: "Falhas de pagamento", renewals: "Renovações", cancellations: "Cancelamentos de assinatura", queue_age_sample_size: "Questões na amostra de idade", queue_oldest_at: "Questão mais antiga na fila",
};
const currencyKeys = new Set(["mrr", "arr", "received_revenue", "previous_received_revenue", "average_ticket_received", "average_ticket_mrr"]);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const financialKeys = ["received_revenue", "previous_received_revenue", "received_revenue_change_percent", "payments_count", "previous_payments_count", "average_ticket_received", "new_paid_subscriptions", "renewals", "canceled_subscriptions", "payments_failed", "mrr", "arr", "average_ticket_mrr", "active_subscriptions", "recurring_subscriptions", "scheduled_cancellations", "past_due_subscriptions", "pending_subscriptions", "pending_checkouts", "reactivations"];

function display(key: string, value: unknown) {
  if (value === null || value === undefined) return "—";
  if (currencyKeys.has(key)) return brl.format(Number(value));
  if (key.endsWith("_percent")) return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (key.endsWith("_at") && typeof value === "string") return new Date(value).toLocaleString("pt-BR");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return typeof value === "number" ? value.toLocaleString("pt-BR", {maximumFractionDigits: 1}) : String(value);
}

function MetricSection({ title, values, keys }: { title: string; values: Record<string, unknown>; keys?: string[] }) {
  const rows = (keys ?? Object.keys(values)).filter(key => values[key] === null || ["string", "number"].includes(typeof values[key]));
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-4 text-base font-semibold">{title}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(key => <article key={key} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">{labels[key] || key.replaceAll("_", " ")}</p><p className="mt-1 text-lg font-semibold">{display(key, values[key])}</p></article>)}</div></section>;
}

function FinancialSection({ data }: { data: FinancialMetrics }) {
  const cycleLabels: Record<string, string> = {mensal: "Mensal", semestral: "Semestral", anual: "Anual", unknown: "Não identificado"};
  return <>
    {(data.excluded_receipts > 0 || data.previous_excluded_receipts > 0) && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Cobertura financeira incompleta: {data.excluded_receipts} recibo(s) excluído(s) no período e {data.previous_excluded_receipts} no anterior por ausência de confirmação, valor, data, fatura ou moeda BRL. A variação percentual fica indisponível.</p>}
    <MetricSection title="Financeiro · BRL" values={data} keys={financialKeys} />
    <p className="text-sm text-slate-500">MRR/ARR: fotografia atual em {new Date(data.snapshot_at).toLocaleString("pt-BR")}. {data.definitions.mrr}</p>
    <section className="rounded-2xl border bg-white p-5 dark:bg-slate-950">
      <h2 className="font-semibold">Receita por plano e ciclo da contratação</h2>
      {data.revenue_groups_truncated && <p role="status" className="mt-2 text-sm text-amber-700">Exibindo os primeiros {data.groups_limit} grupos. Os totais incluem todos os recibos.</p>}
      <div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Plano</th><th className="p-2">Ciclo</th><th className="p-2">Recibos</th><th className="p-2">Receita</th></tr></thead><tbody>{data.revenue_by_plan_cycle.map(row => <tr key={`${row.plan_slug}:${row.plan_name}:${row.cycle}`} className="border-t"><td className="p-2">{row.plan_name}</td><td className="p-2">{cycleLabels[row.cycle] ?? row.cycle}</td><td className="p-2">{row.payments_count}</td><td className="p-2">{brl.format(Number(row.received_revenue))}</td></tr>)}</tbody></table>{!data.revenue_by_plan_cycle.length && <p className="p-2 text-slate-500">Sem recibos com valor confirmado no período.</p>}</div>
    </section>
    <section className="rounded-2xl border bg-white p-5 dark:bg-slate-950">
      <h2 className="font-semibold">Receita diária no fuso do relatório</h2>
      <div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Dia</th><th className="p-2">Recibos</th><th className="p-2">Receita</th></tr></thead><tbody>{data.daily_revenue.map(row => <tr key={row.date} className="border-t"><td className="p-2">{row.date.split("-").reverse().join("/")}</td><td className="p-2">{row.payments_count}</td><td className="p-2">{brl.format(Number(row.received_revenue))}</td></tr>)}</tbody></table>{!data.daily_revenue.length && <p className="p-2 text-slate-500">Sem dados no período.</p>}</div>
    </section>
    <details className="rounded-2xl border p-5 text-sm"><summary className="cursor-pointer font-semibold">Definições e cobertura financeira</summary><p className="mt-3">{data.received_revenue_status}</p>{Object.entries(data.definitions).map(([key, text]) => <p key={key} className="mt-3 text-slate-600 dark:text-slate-300">{text}</p>)}</details>
  </>;
}

export default function BusinessReports() {
  const [params, setParams] = useState<ReportParams>({days: 30});
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [data, setData] = useState<BusinessReport>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setError(""); setLoading(true); setData(undefined);
    businessReports.get(params).then(result => { if (active) setData(result); }).catch((error: unknown) => {
      if (active) setError(isAxiosError(error) && typeof error.response?.data?.detail === "string" ? error.response.data.detail : "Não foi possível carregar os relatórios. Tente novamente.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params]);
  const csvUrl = data ? businessReports.exportUrl({since: data.period.since, until: data.period.until}) : undefined;
  const rankings = data ? [
    {title: "Disciplinas mais respondidas", rows: data.product.top_disciplines},
    {title: "Bancas mais respondidas", rows: data.product.top_bancas},
    {title: "Provas mais respondidas", rows: data.product.top_exams},
  ] : [];
  return <div className="space-y-6">
    <PageHeader title="Relatórios de negócio" description="Recebimentos confirmados, recorrência atual e indicadores de uso com definições explícitas." />
    <div className="flex flex-wrap items-center gap-2">{[7, 30, 90].map(days => <Button key={days} variant={params.days === days && !params.since ? "default" : "outline"} onClick={() => {setSince(""); setUntil(""); setParams({days});}}>{days} dias</Button>)}{csvUrl && <a className="rounded-md border px-3 py-2 text-sm font-medium" href={csvUrl}>Exportar este período em CSV</a>}</div>
    <form className="flex flex-wrap items-end gap-3 text-sm" onSubmit={event => {event.preventDefault(); setParams({since, until});}}>
      <label className="grid gap-1">Início<input required type="date" value={since} onChange={event => setSince(event.target.value)} className="rounded-md border bg-transparent p-2" /></label>
      <label className="grid gap-1">Fim (exclusivo)<input required type="date" value={until} onChange={event => setUntil(event.target.value)} className="rounded-md border bg-transparent p-2" /></label>
      <Button type="submit">Aplicar período</Button><p className="text-slate-500">Até 365 dias. Datas usam o fuso do relatório.</p>
    </form>
    {loading && <p role="status">Carregando relatório…</p>}
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {data && <>
      <p className="text-sm text-slate-500">Período: {new Date(data.period.since).toLocaleString("pt-BR", {timeZone: data.period.timezone})} até {new Date(data.period.until).toLocaleString("pt-BR", {timeZone: data.period.timezone})} (fim exclusivo). Fuso: {data.period.timezone}. Atualizado em {new Date(data.period.generated_at).toLocaleString("pt-BR")}.</p>
      {data.financial.access_granted ? <FinancialSection data={data.financial} /> : <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Indicadores financeiros restritos a administradores com permissão financeira.</section>}
      <MetricSection title="Crescimento e ativação" values={data.growth} />
      <p className="text-sm text-slate-500">Usuário ativo: {data.definitions.active_user} {data.definitions.snapshot}</p>
      <MetricSection title="Produto e aprendizado" values={data.product} />
      <MetricSection title="Operação" values={data.operation} />
      <div className="grid gap-4 lg:grid-cols-3">{rankings.map(({title, rows}) => <section key={title} className="rounded-2xl border bg-white p-5 dark:bg-slate-950"><h2 className="font-semibold">{title}</h2><ol className="mt-3 space-y-2 text-sm">{rows.length ? rows.map(row => <li key={row.label} className="flex justify-between gap-3"><span className="truncate">{row.label}</span><strong>{row.count}</strong></li>) : <li className="text-slate-500">Sem dados no período.</li>}</ol></section>)}</div>
      <p className="text-sm text-slate-500">{data.growth.acquisition.message} {data.product.article_access.message}</p>
    </>}
  </div>;
}
