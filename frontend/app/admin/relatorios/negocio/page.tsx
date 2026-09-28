"use client";

import { useEffect, useState } from "react";
import { businessReports } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";

const labels: Record<string, string> = {
  mrr: "MRR", arr: "ARR", active_subscriptions: "Assinaturas ativas", new_paid_subscriptions: "Novas assinaturas pagas", pending_subscriptions: "Assinaturas pendentes", canceled_subscriptions: "Cancelamentos", received_revenue: "Receita recebida", new_users: "Novos cadastros", previous_new_users: "Cadastros no período anterior", new_users_change_percent: "Crescimento de cadastros", active_users: "Usuários ativos", dau: "DAU", wau: "WAU", mau: "MAU", activation_rate_percent: "Taxa de ativação", signup_to_active_subscription_percent: "Cadastro → assinatura ativa", questions_answered: "Questões respondidas", correct_answers: "Acertos", correct_rate_percent: "Taxa de acerto", study_sessions: "Sessões de estudo", study_minutes: "Minutos estudados", simulations_finished: "Simulados concluídos", flashcards_created: "Flashcards criados", chat_queries: "Consultas ao chat", questions_pending: "Questões na fila", questions_approved: "Questões aprovadas", questions_rejected: "Questões rejeitadas", queue_average_age_hours: "Idade média da fila (h)", payments_received: "Pagamentos confirmados", payments_failed: "Pagamentos recusados", renewals: "Renovações", cancellations: "Cancelamentos de assinatura",
};

function value(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number" && !Number.isInteger(value)) return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return String(value);
}

function MetricSection({ title, values }: { title: string; values: Record<string, unknown> }) {
  const rows = Object.entries(values).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item));
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-4 text-base font-semibold">{title}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(([key, item]) => <article key={key} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">{labels[key] || key.replaceAll("_", " ")}</p><p className="mt-1 text-lg font-semibold">{value(item)}</p></article>)}</div></section>;
}

export default function BusinessReports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => { setError(""); businessReports.get(days).then(setData).catch(() => setError("Não foi possível carregar os relatórios. Tente novamente.")); }, [days]);
  const csvUrl = `/api/backoffice/reports/business/?days=${days}&export=csv`;
  return <div className="space-y-6"><PageHeader title="Relatórios de negócio" description="Indicadores agregados, com período e definições explícitas para apoiar decisões." /><div className="flex flex-wrap items-center gap-2">{[7, 30, 90].map((item) => <Button key={item} variant={days === item ? "default" : "outline"} onClick={() => setDays(item)}>{item} dias</Button>)}<a className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-900" href={csvUrl}>Exportar CSV</a></div>{error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{data && <><p className="text-sm text-slate-500">Atualizado em {new Date(data.period.generated_at).toLocaleString("pt-BR")}. Usuário ativo: {data.definitions.active_user}</p>{data.financial.access_granted ? <MetricSection title="Financeiro" values={data.financial} /> : <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Os indicadores financeiros são restritos. Conceda a permissão <code>backoffice.view_financial_reports</code> ao administrador responsável.</section>}<MetricSection title="Crescimento e ativação" values={data.growth} /><MetricSection title="Produto e aprendizado" values={data.product} /><MetricSection title="Operação" values={data.operation} /><div className="grid gap-4 lg:grid-cols-3">{[["Disciplinas mais respondidas", data.product.top_disciplines], ["Bancas mais respondidas", data.product.top_bancas], ["Provas mais respondidas", data.product.top_exams]].map(([title, rows]: any) => <section key={title} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><h2 className="font-semibold">{title}</h2><ol className="mt-3 space-y-2 text-sm">{rows.length ? rows.map((row: any) => <li key={row.label} className="flex justify-between gap-3"><span className="truncate">{row.label}</span><strong>{row.count}</strong></li>) : <li className="text-slate-500">Sem dados no período.</li>}</ol></section>)}</div><section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-950"><h2 className="font-semibold">Disponibilidade dos dados</h2><p className="mt-2 text-slate-600 dark:text-slate-300">{data.financial.received_revenue_status || data.definitions.financial}</p><p className="mt-1 text-slate-600 dark:text-slate-300">{data.growth.acquisition.message} {data.product.article_access.message}</p></section></>}</div>;
}
