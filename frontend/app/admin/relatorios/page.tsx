"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Timer,
  Users,
  Layers,
  Target,
  ShieldOff,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { backoffice, StudyReport } from "@/lib/backoffice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { StatCard } from "@/components/admin/StatCard";
import { BarChart } from "@/components/admin/BarChart";

export default function AdminRelatoriosPage() {
  const [report, setReport] = useState<StudyReport | null>(null);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await backoffice.studyReport(days));
    } catch {
      setError("Não foi possível carregar os relatórios de estudo.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios de estudo"
        description="Desempenho dos alunos: respostas, acertos, tempo, flashcards e simulados."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[7, 14, 30, 90].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} dias
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              Atualizar
            </Button>
          </div>
        }
      />

      {error && <Notice kind="error">{error}</Notice>}
      {loading && !report && <LoadingState label="Carregando relatórios de estudo..." />}

      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Respostas"
              value={report.total_answers.toLocaleString("pt-BR")}
              hint="no período"
              icon={<BookOpen className="h-4 w-4" />}
              accent="indigo"
            />
            <StatCard
              title="Acertos"
              value={report.correct_answers.toLocaleString("pt-BR")}
              hint={`${Math.round(report.accuracy)}% de precisão`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              accent="emerald"
            />
            <StatCard
              title="Tempo de estudo"
              value={`${Math.round(report.total_minutes / 60)}h`}
              hint={`${report.total_minutes} minutos`}
              icon={<Timer className="h-4 w-4" />}
              accent="amber"
            />
            <StatCard
              title="Alunos ativos"
              value={report.active_users.toLocaleString("pt-BR")}
              hint="no período"
              icon={<Users className="h-4 w-4" />}
              accent="sky"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              title="Flashcards"
              value={report.flashcards.toLocaleString("pt-BR")}
              hint="revisados no período"
              icon={<Layers className="h-4 w-4" />}
              accent="violet"
            />
            <StatCard
              title="Simulados"
              value={report.simulations.total.toLocaleString("pt-BR")}
              hint={`média ${Math.round(report.simulations.avg_score)} · máx ${report.simulations.max_score ?? 0}`}
              icon={<Target className="h-4 w-4" />}
              accent="rose"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Respostas por dia</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={report.daily.map((d) => ({ label: d.date.slice(5), value: d.answers }))}
                color="bg-indigo-500"
                height={40}
                formatValue={(v) => `${v} respostas`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Minutos estudados por dia</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={report.daily.map((d) => ({ label: d.date.slice(5), value: d.minutes }))}
                color="bg-amber-400"
                height={40}
                formatValue={(v) => `${v} min`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alunos com melhor desempenho</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Aluno</TableHead>
                    <TableHead className="text-right">Respostas</TableHead>
                    <TableHead className="text-right">Acertos</TableHead>
                    <TableHead className="text-right">Precisão</TableHead>
                    <TableHead className="text-right">Minutos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.top_students.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center">
                        <EmptyState
                          icon={<ShieldOff className="h-5 w-5" />}
                          title="Nenhum dado no período"
                          description="Os alunos ainda não estudaram neste intervalo."
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  {report.top_students.map((s) => (
                    <TableRow key={s.user_id}>
                      <TableCell>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{s.username}</p>
                      </TableCell>
                      <TableCell className="text-right">{s.answers}</TableCell>
                      <TableCell className="text-right">{s.correct}</TableCell>
                      <TableCell className="text-right">
                        {s.answers > 0 ? `${Math.round((s.correct / s.answers) * 100)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-slate-500">{s.minutes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
