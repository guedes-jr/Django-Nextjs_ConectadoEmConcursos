"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CreditCard,
  Package,
  FileText,
  MessageSquare,
  Database,
  RefreshCw,
  Timer,
  Target,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { backoffice, Overview, formatDate } from "@/lib/backoffice";
import type { ChatUsageReport, StudyReport } from "@/lib/backoffice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/StatCard";
import { Notice, LoadingState } from "@/components/admin/Notice";
import { StatusBadge, BadgeViolet } from "@/components/admin/StatusBadge";

function hoursLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<{
    overview: Overview;
    chat: ChatUsageReport;
    study: StudyReport;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overview, chat, study] = await Promise.all([
        backoffice.overview(),
        backoffice.chatUsage(14),
        backoffice.studyReport(14),
      ]);
      setData({ overview, chat, study });
      setError(null);
    } catch {
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
    setError(null);
    try {
      await backoffice.createBackup();
      setNotice("Backup criado com sucesso.");
      void load();
    } catch {
      setError("Falha ao criar o backup.");
    } finally {
      setBackingUp(false);
    }
  };

  if (loading && !data) {
    return (
      <Card>
        <LoadingState label="Carregando indicadores..." />
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <Notice kind="error">{error}</Notice>
          <Button variant="outline" className="mt-4" onClick={load}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { overview, chat, study } = data!;
  const s = overview.subscriptions;

  return (
    <div className="space-y-6">
      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Visão geral</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Métricas principais em {formatDate(new Date().toISOString()).split(",")[0]}
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Usuários"
          value={overview.users.total}
          hint={`${overview.users.active} ativos · ${overview.users.staff} staff`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Assinaturas ativas"
          value={s.active}
          hint={`${s.total} no total · ${s.pending_payment} pagamento pendente`}
          icon={<CreditCard className="h-4 w-4" />}
          accent="emerald"
        />
        <StatCard
          title="Questões sem comentário"
          value={overview.questions.uncommented}
          hint={`${overview.questions.total} questões cadastradas`}
          icon={<FileText className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          title="Minutos estudados"
          value={hoursLabel(study.total_minutes)}
          hint={`${study.active_users} alunos ativos em 14 dias`}
          icon={<Timer className="h-4 w-4" />}
          accent="sky"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Planos ativos"
          value={`${overview.plans.active}/${overview.plans.total}`}
          hint="Publicados para venda"
          icon={<Package className="h-4 w-4" />}
          accent="violet"
        />
        <StatCard
          title="Perguntas à IA (14d)"
          value={chat.queries}
          hint={`${chat.active_users} usuários · ${Math.round((chat.input_tokens + chat.output_tokens) / 1000)}k tokens`}
          icon={<MessageSquare className="h-4 w-4" />}
          accent="indigo"
        />
        <StatCard
          title="Taxa de acerto"
          value={`${study.accuracy}%`}
          hint={`${study.correct_answers} corretas de ${study.total_answers} respostas`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="emerald"
        />
        <StatCard
          title="Provas pendentes"
          value={overview.proofs.pending}
          hint={`${overview.proofs.reviewed} revisadas`}
          icon={<Target className="h-4 w-4" />}
          accent="rose"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Assinaturas recentes</CardTitle>
            <Link href="/admin/assinaturas" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Ver todas
            </Link>
          </CardHeader>
          {overview.recent_subscriptions.length === 0 ? (
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-400">Nenhuma assinatura recente.</p>
            </CardContent>
          ) : (
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {overview.recent_subscriptions.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.username}</p>
                      <p className="text-xs text-slate-500">
                        {item.plan} · {formatDate(item.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Usuários recentes</CardTitle>
            <Link href="/admin/usuarios" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {overview.recent_users.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.username}</p>
                    <p className="truncate text-xs text-slate-500">{item.email || "sem e-mail"}</p>
                  </div>
                  <BadgeViolet>{item.is_staff ? "Staff" : "Aluno"}</BadgeViolet>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-indigo-500" /> Conteúdo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Notícias fora do ar</span>
              <span className="font-semibold tabular-nums">{overview.content.news_unpublished}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Posts no fórum</span>
              <span className="font-semibold tabular-nums">{overview.content.community_posts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Concursos de inscrição aberta</span>
              <span className="font-semibold tabular-nums">{overview.content.concursos_open}</span>
            </div>
            <Link href="/admin/conteudo" className="inline-flex pt-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Gerenciar conteúdo
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-indigo-500" /> Chat IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Conversas totais</span>
              <span className="font-semibold tabular-nums">{chat.conversations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mensagens da IA</span>
              <span className="font-semibold tabular-nums">{chat.messages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tokens consumidos</span>
              <span className="font-semibold tabular-nums">{((chat.input_tokens + chat.output_tokens) / 1000).toFixed(1)}k</span>
            </div>
            <Link href="/admin/relatorios" className="inline-flex pt-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Ver relatórios de estudo
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-indigo-500" /> Backups
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Backups salvos</span>
              <span className="font-semibold tabular-nums">{overview.backups.count}</span>
            </div>
            <p className="truncate text-xs text-slate-500">
              {overview.backups.last ? `Último: ${overview.backups.last}` : "Nenhum backup ainda."}
            </p>
            <div className="pt-1">
              <Button size="sm" onClick={createBackup} disabled={backingUp}>
                {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {backingUp ? "Criando..." : "Criar backup"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}