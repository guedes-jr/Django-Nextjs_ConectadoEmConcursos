"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice } from "@/components/admin/Notice";
import { QueueList, type QueueState } from "@/components/admin/questions/QueueList";
import { ReviewPanel } from "@/components/admin/questions/ReviewPanel";
import { adminUrl } from "@/lib/admin";
import { content, apiMessage, type QueueFilters, type RejectionReasons, type SearchRun } from "@/lib/content";

const EXPLANATION_MAX = 120;

type Feedback = { kind: "error" | "success" | "info"; message: string } | null;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function QuestoesPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">Carregando fila de revisão...</div>}>
      <QuestoesReview />
    </Suspense>
  );
}

function QuestoesReview() {
  const searchParams = useSearchParams();
  const [sources, setSources] = useState<Awaited<ReturnType<typeof content.sources>>>([]);
  const [selectedSource, setSelectedSource] = useState(searchParams.get("fonte") ?? "");
  const [runId, setRunId] = useState<number | null>(Number(searchParams.get("busca")) || null);
  const [run, setRun] = useState<SearchRun | null>(null);
  const [filters, setFilters] = useState<QueueFilters>({ status: "pending", limit: 50 });
  const [state, setState] = useState<QueueState>({ results: [], total: 0, loading: true, error: null });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReasons>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
    const [listOpen, setListOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SearchRun[]>([]);
  const [explanationInvalid, setExplanationInvalid] = useState(false);
  const [reasonsInvalid, setReasonsInvalid] = useState(false);
  const explanationRef = useRef<HTMLTextAreaElement | null>(null);
  const reasonsRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => state.results.find((item) => item.id === selectedId) ?? null,
    [state.results, selectedId],
  );

  const loadQueue = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const page = await content.queue({
        ...filters,
        source: selectedSource || undefined,
        search_run: runId ?? undefined,
      });
      setState({ results: page.results, total: page.total, loading: false, error: null });
      setSelectedId((current) => (current && page.results.some((item) => item.id === current) ? current : page.results[0]?.id ?? null));
    } catch (err) {
      const message = apiMessage((err as { response?: { data?: unknown } })?.response?.data, "Não foi possível carregar a fila.");
      setState({ results: [], total: 0, loading: false, error: message });
    }
  }, [filters, selectedSource, runId]);

  useEffect(() => {
    void (async () => {
      try {
        setSources(await content.sources());
        setRejectionReasons(await content.rejectionReasons());
      } catch {
        setFeedback({ kind: "error", message: "Não foi possível carregar as fontes do conteúdo." });
      }
    })();
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // O detalhe da busca alimenta o cabeçalho ("12 de 340 · 74% concluído").
  useEffect(() => {
    if (!runId) {
      setRun(null);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const detail = await content.run(runId);
        if (active) setRun(detail);
      } catch (err) {
        if (!active) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          setRunId(null);
          setFeedback({
            kind: "error",
            message: "Busca não encontrada ou sem permissão. Confira o histórico de buscas.",
          });
          return;
        }
        setFeedback({
          kind: "error",
          message: apiMessage((err as { response?: { data?: unknown } })?.response?.data, "Não foi possível ler a busca."),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [runId]);

  useEffect(() => {
    if (selected) setExplanation(selected.explanation ?? "");
  }, [selected]);

  const position = selected ? state.results.findIndex((item) => item.id === selected.id) + 1 : 0;
  const reviewed = run?.reviewed_count ?? 0;
  const runTotal = run?.questions_count ?? 0;
  const percent = runTotal > 0 ? Math.round((reviewed / runTotal) * 100) : 0;

  const advance = useCallback(
    (fromId: number) => {
      const index = state.results.findIndex((item) => item.id === fromId);
      const next = state.results[index + 1];
      setSelectedId(next ? next.id : null);
    },
    [state.results],
  );

  const decide = useCallback(
    async (action: "approve" | "reject" | "draft", payload: { reason?: string; reason_code?: string }) => {
      if (!selected) return;
      setBusy(true);
      setFeedback(null);
      setExplanationInvalid(false);
      setReasonsInvalid(false);
      try {
        if (action === "draft") {
          await content.draft({ id: selected.id, note: explanation });
          setFeedback({ kind: "success", message: "Rascunho salvo." });
          return;
        }
        const body = { id: selected.id, updated_at: selected.updated_at, ...payload };
        const data = action === "approve"
          ? await content.approve({ ...body, explanation })
          : await content.reject({ ...body, reason: payload.reason ?? "", reason_code: payload.reason_code ?? "" });
        const updated = data.results[0];
        // Aprovar não volta na API: a fila local já sabe o resultado.
        setState((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        }));
        setFeedback({
          kind: "success",
          message: action === "approve" ? `Questão #${updated.id} aprovada.` : `Questão #${updated.id} rejeitada.`,
        });
        if (action === "approve") advance(updated.id);
      } catch (err) {
        const response = (err as { response?: { status?: number; data?: unknown } })?.response;
        const status = response?.status;
        const data = response?.data as { code?: string; explanation?: string[] } | undefined;
        if (status === 400 && Array.isArray(data?.explanation)) {
          setExplanationInvalid(true);
          explanationRef.current?.focus();
          setFeedback({
            kind: "error",
            message: `Comentário inválido: ${explanation.trim().length}/${EXPLANATION_MAX} caracteres. Mínimo de 1.`,
          });
          return;
        }
        if (status === 400 && action === "reject") {
          setReasonsInvalid(true);
          reasonsRef.current?.focus();
          setFeedback({ kind: "error", message: apiMessage(data, "Informe o motivo da rejeição.") });
          return;
        }
        if (status === 400) {
          setFeedback({ kind: "error", message: apiMessage(data, "A API recusou a decisão.") });
          return;
        }
        if (status === 409 && data?.code === "already_reviewed") {
          setState((current) => ({ ...current, results: current.results.filter((item) => item.id !== selected.id) }));
          setFeedback({ kind: "info", message: "Esta questão já estava revisada. Indo para a próxima." });
          advance(selected.id);
          return;
        }
        if (status === 409) {
          setFeedback({ kind: "error", message: "Esta questão foi atualizada por outro revisor. Recarregando." });
          await loadQueue();
          return;
        }
        setFeedback({ kind: "error", message: "Falha ao salvar — tente novamente." });
      } finally {
        setBusy(false);
      }
    },
    [selected, explanation, advance, loadQueue],
  );

  const goNext = useCallback(() => {
    if (!selected) return;
    const index = state.results.findIndex((item) => item.id === selected.id);
    const next = state.results[index + 1];
    if (next) setSelectedId(next.id);
  }, [selected, state.results]);

  const goPrevious = useCallback(() => {
    if (!selected) return;
    const index = state.results.findIndex((item) => item.id === selected.id);
    const previous = state.results[index - 1];
    if (previous) setSelectedId(previous.id);
  }, [selected, state.results]);

  const openHistory = useCallback(async () => {
    setHistoryOpen((open) => !open);
    if (history.length) return;
    try {
      const data = await content.runs({ source: selectedSource || undefined, limit: 20 });
      setHistory(data.results);
    } catch {
      setFeedback({ kind: "error", message: "Não foi possível carregar o histórico de buscas." });
    }
  }, [history.length, selectedSource]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (!selected) return;
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        void decide("approve", {});
      } else if (key === "s") {
        event.preventDefault();
        void decide("draft", {});
      } else if (key === "p") {
        event.preventDefault();
        advance(selected.id);
      } else if (key === "r") {
        // Não rejeita com o primeiro motivo da lista: um `R` acidental não pode
        // descartar a questão. Foca os motivos e o revisor escolhe.
        event.preventDefault();
        if (rejectionReasons.length === 0) {
          setFeedback({ kind: "error", message: "Nenhum motivo de rejeição cadastrado." });
          return;
        }
        reasonsRef.current?.focus();
        setReasonsInvalid(true);
      } else if (key === "j") {
        event.preventDefault();
        goNext();
      } else if (key === "k") {
        event.preventDefault();
        goPrevious();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, decide, advance, goNext, goPrevious, rejectionReasons]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fila de revisão"
        description="Revise, aprove ou rejeite questões que já foram importadas para a fila."
        actions={
          <>
            <Button variant="outline" onClick={() => void openHistory()}>
              <History className="h-4 w-4" /> Histórico de buscas
            </Button>
            <Button asChild><Link href="/admin/fontes-questoes"><Search className="h-4 w-4" /> Buscar em fontes</Link></Button>
          </>
        }
      />

      {feedback && <Notice kind={feedback.kind}>{feedback.message}</Notice>}
      {state.error && <Notice kind="error">{state.error}</Notice>}

      {historyOpen && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {history.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Nenhuma busca registrada.</li>}
            {history.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="font-mono text-xs text-slate-500">#{item.id}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{item.name}</span>
                <span className="text-xs text-slate-500">
                  {item.questions_count ?? 0} questões · {item.status} · {item.started_by ?? "sistema"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    setRunId(item.id);
                    setFilters({ ...filters, status: "pending" });
                    setHistoryOpen(false);
                  }}
                >
                  Revisar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-start gap-4">
        <QueueList
          state={state}
          selectedId={selectedId}
          onSelect={(question) => setSelectedId(question.id)}
          filters={filters}
          onFiltersChange={setFilters}
          sources={sources}
          selectedSource={selectedSource}
          onSourceChange={setSelectedSource}
          runId={runId}
          onRunIdChange={setRunId}
          run={run}
          onOpenSearch={() => { window.location.href = "/admin/fontes-questoes"; }}
          onReload={() => void loadQueue()}
          listOpen={listOpen}
          onListOpenChange={setListOpen}
        />

        <section className="min-w-0 flex-1">
          {selected ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {runId ? (
                  <>
                    {position} de {runTotal} nesta busca · {percent}% concluído
                  </>
                ) : (
                  <>
                    {position} de {state.total} nesta fila
                  </>
                )}
              </p>
              <ReviewPanel
                key={selected.id}
                question={selected}
                explanation={explanation}
                onExplanationChange={setExplanation}
                rejectionReasons={rejectionReasons}
                onApprove={() => void decide("approve", {})}
                onReject={(reason_code, reason) => void decide("reject", { reason_code, reason })}
                onSkip={() => advance(selected.id)}
                onGoNext={goNext}
                onGoPrevious={goPrevious}
                busy={busy}
                explanationInvalid={explanationInvalid}
                explanationRef={explanationRef}
                reasonsRef={reasonsRef}
                reasonsInvalid={reasonsInvalid}
                hasPrevious={position > 1}
                hasNext={position < state.results.length}
              />
              <p className="text-xs text-slate-400">
                Atalhos: <kbd>A</kbd> aprovar · <kbd>R</kbd> rejeitar · <kbd>S</kbd> salvar rascunho ·{" "}
                <kbd>P</kbd> pular · <kbd>J</kbd>/<kbd>K</kbd> navegar.{" "}
                <a href={adminUrl("questions/question/")} className="underline">
                  Ver no admin do Django
                </a>
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <Inbox className="h-4 w-4" /> Fila em dia
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Nenhuma questão pendente com esses filtros. Use Fontes de questões para buscar e enviar novas questões à fila.
              </p>
              <Button className="mt-4" asChild><Link href="/admin/fontes-questoes">Buscar em fontes</Link></Button>
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
