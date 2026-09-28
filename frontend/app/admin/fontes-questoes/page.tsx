"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice } from "@/components/admin/Notice";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/components/admin/questions/SearchDialog";
import { adminUrl } from "@/lib/admin";
import { apiMessage, content, type SearchRun, type SourceCatalogItem } from "@/lib/content";

export default function FontesQuestoesPage() {
  const [sources, setSources] = useState<SourceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSources(await content.sourceCatalog());
    } catch (error) {
      setFeedback({ kind: "error", message: apiMessage((error as { response?: { data?: unknown } })?.response?.data, "Não foi possível carregar o catálogo de fontes.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const imported = (run: SearchRun) => {
    setFeedback({ kind: "success", message: `Busca #${run.id} concluída. As questões foram enviadas para a fila de revisão.` });
    void load();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fontes de questões"
        description="Escolha uma fonte autorizada, refine os filtros e envie o resultado para a fila de revisão."
        actions={<><Button variant="outline" asChild><a href={adminUrl("questions/questionsource/add/")}>Cadastrar fonte</a></Button><Button onClick={() => setDialogOpen(true)} className="bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md dark:bg-blue-500 dark:text-blue-950 dark:hover:bg-blue-400"><Search className="h-4 w-4" /> Nova busca</Button></>}
      />
      {feedback && <Notice kind={feedback.kind}>{feedback.message}</Notice>}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100">
        <ShieldCheck className="mr-2 inline h-4 w-4" /> A busca não publica questões: ela apenas cria itens pendentes. A aprovação acontece separadamente na <Link className="font-medium underline" href="/admin/fila-questoes">fila de revisão</Link>.
      </div>
      {loading ? <div className="py-16 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Carregando fontes...</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((source) => (
            <article key={source.slug} className="flex min-h-60 flex-col rounded-xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-slate-100">{source.label}</h2><p className="mt-1 text-xs text-slate-500">{source.kind.replaceAll("_", " ")}</p></div><span className={source.ready_for_import ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"}>{source.ready_for_import ? "Pronta" : "Configuração pendente"}</span></div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{source.availability_message}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div><dt className="text-slate-500">Na fila</dt><dd className="mt-1 font-semibold">{source.pending_total}</dd></div><div><dt className="text-slate-500">Importadas</dt><dd className="mt-1 font-semibold">{source.questions_total}</dd></div><div><dt className="text-slate-500">Buscas</dt><dd className="mt-1 font-semibold">{source.runs_total}</dd></div></dl>
              <p className="mt-4 text-xs text-slate-500">Licença: {source.license_name || "não informada"}</p>
              <div className="mt-auto flex gap-2 pt-4">{source.ready_for_import ? <Button size="sm" onClick={() => setDialogOpen(true)}>Buscar e enviar à fila</Button> : <Button size="sm" variant="outline" asChild><a href={adminUrl(`questions/questionsource/${source.id}/change/`)}>Configurar</a></Button>}{source.home_url && <Button size="sm" variant="ghost" asChild><a href={source.home_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Origem</a></Button>}</div>
            </article>
          ))}
          {sources.length === 0 && <p className="text-sm text-slate-500">Nenhuma fonte cadastrada. Cadastre uma fonte com licença e configuração de coleta antes de ativá-la.</p>}
        </div>
      )}
      <SearchDialog open={dialogOpen} onOpenChange={setDialogOpen} onFinished={imported} />
    </div>
  );
}
