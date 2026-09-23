"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CreditCard,
  FileText,
  MessageSquare,
  Package,
  Database,
  RefreshCw,
  Loader2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { backoffice, Overview, formatDate, statusLabel, statusColor } from "@/lib/backoffice";

function Card({
  title,
  value,
  subtitle,
  hint,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {subtitle}
        {hint ? <span className="ml-1 text-blue-600 dark:text-blue-400">· {hint}</span> : null}
      </p>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await backoffice.overview());
      setError(null);
    } catch (err) {
      setError("Não foi possível carregar os indicadores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createBackup = async () => {
    setBackingUp(true);
    setNotice(null);
    try {
      await backoffice.createBackup();
      setNotice("Backup criado com sucesso.");
      void load();
    } catch {
      setNotice(null);
      setError("Falha ao criar o backup.");
    } finally {
      setBackingUp(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        <p className="flex items-center gap-2 font-medium"><AlertTriangle size={18} /> {error}</p>
        <button type="button" onClick={load} className="mt-3 text-sm font-semibold underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  const s = data!.subscriptions;
  const overdue = s.pending;

  return (
    <div className="space-y-8">
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

      <section>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Visão geral</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Métricas principais do {formatDate(new Date().toISOString()).split(",")[0]}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          title="Usuários"
          value={data!.users.total}
          subtitle={`${data!.users.active} ativos · ${data!.users.staff} staff`}
          hint="Ver usuários"
        />
        <Card
          title="Assinaturas ativas"
          value={s.active}
          subtitle={`${s.total} no total · ${s.pending} pagamento pendente`}
          hint={overdue ? "Atenção às pendências" : undefined}
        />
        <Card title="Planos ativos" value={`${data!.plans.active}/${data!.plans.total}`} subtitle="Publicados para venda" />
        <Card
          title="Questões sem comentário"
          value={data!.questions.uncommented}
          subtitle={`${data!.questions.with_comment} com comentário de ${data!.questions.total} questões`}
          hint="Preencher"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <CreditCard size={18} className="text-indigo-500" /> Assinaturas recentes
            </h2>
            <Link href="/admin/assinaturas" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data!.recent_subscriptions.length === 0 && (
              <li className="px-5 py-6 text-sm text-slate-500">Nenhuma assinatura recente.</li>
            )}
            {data!.recent_subscriptions.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.username}</p>
                  <p className="text-xs text-slate-500">
                    {item.plan} · {formatDate(item.created_at)}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {statusLabel[item.status] ?? item.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Users size={18} className="text-indigo-500" /> Usuários recentes
            </h2>
            <Link href="/admin/usuarios" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Ver todos
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data!.recent_users.length === 0 && (
              <li className="px-5 py-6 text-sm text-slate-500">Nenhum usuário recente.</li>
            )}
            {data!.recent_users.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.username}</p>
                  <p className="truncate text-xs text-slate-500">{item.email || "sem e-mail"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.is_staff ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                  {item.is_staff ? "Staff" : "Aluno"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <FileText size={18} className="text-indigo-500" /> Conteúdo
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Provas pendentes de revisão</dt><dd className="font-semibold">{data!.proofs.pending}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Notícias fora do ar</dt><dd className="font-semibold">{data!.content.news_unpublished}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Posts no fórum</dt><dd className="font-semibold">{data!.content.community_posts}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Concursos de inscrição aberta</dt><dd className="font-semibold">{data!.content.concursos_open}</dd></div>
          </dl>
          <Link href="/admin/conteudo" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Gerenciar conteúdo
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Package size={18} className="text-indigo-500" /> Planos
          </h2>
          <p className="mt-4 text-sm text-slate-500">
            {data!.plans.active} ativos de {data!.plans.total} planos configurados.
          </p>
          <Link href="/admin/planos" className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Editar planos
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Database size={18} className="text-indigo-500" /> Backups
          </h2>
          <p className="mt-4 text-sm text-slate-500">
            {data!.backups.count > 0 ? (
              <>Último backup: <span className="font-medium text-slate-700 dark:text-slate-200">{data!.backups.last}</span></>
            ) : (
              "Nenhum backup encontrado ainda."
            )}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={createBackup}
              disabled={backingUp}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {backingUp ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {backingUp ? "Criando..." : "Criar backup"}
            </button>
            <Link
              href="/admin/backups"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <MessageSquare size={15} /> Gerenciar
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}