"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { editorialDashboard } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { adminError } from "@/components/admin/useAdminListing";

type EditorialIndicators = Record<string, number>;

const labels: Record<string, string> = {
  questions_pending: "Questões na fila",
  article_drafts: "Artigos em rascunho",
  notifications_scheduled: "Avisos agendados",
  notifications_pending: "Confirmações pendentes",
  notification_postponed: "Avisos adiados",
  downloads_failed: "Falhas no acervo",
};

export default function Operations() {
  const [data, setData] = useState<EditorialIndicators | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await editorialDashboard.get());
    } catch (err) {
      setData(null);
      setError(adminError(err, "Não foi possível carregar os indicadores editoriais."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel editorial"
        description="Acompanhe conteúdos, notificações, fila de revisão e operação."
        actions={<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</Button>}
      />
      {loading && !data && <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando indicadores…</p>}
      {error && <section role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Não foi possível carregar os indicadores.</p><p className="mt-1">{error}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Tentar novamente</Button></div></section>}
      {data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(data).map(([key, value]) => <article key={key} className="rounded-lg border p-5"><p className="text-sm text-slate-500">{labels[key] || key}</p><p className="mt-2 text-3xl font-semibold">{value.toLocaleString("pt-BR")}</p></article>)}</div>}
    </div>
  );
}
