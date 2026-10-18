"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, Inbox, Search, ClipboardCheck, Pencil, CheckCircle2, XCircle, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/PageHeader";
import { CatalogSummary, CatalogMetric } from "@/components/admin/CatalogSummary";
import { FilterBar, ListPagination, AdminFilterSelect } from "@/components/admin/ListControls";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/admin/Notice";
import { QueueList, type QueueState } from "@/components/admin/questions/QueueList";
import { ReviewPanel } from "@/components/admin/questions/ReviewPanel";
import { adminUrl } from "@/lib/admin";
import { content, apiMessage, type QueueFilters, type RejectionReasons, type SearchRun } from "@/lib/content";

const EXPLANATION_MIN = 120;
const metrics:CatalogMetric[]=[{key:"total",title:"Total",hint:"Todo o acervo",icon:<Files className="h-4 w-4"/>},{key:"pending",title:"Pendentes",hint:"Aguardando revisão",icon:<ClipboardCheck className="h-4 w-4"/>,filter:["status","pending"],accent:"sky"},{key:"approved",title:"Aprovadas",hint:"Revisão concluída",icon:<CheckCircle2 className="h-4 w-4"/>,filter:["status","approved"],accent:"emerald"},{key:"rejected",title:"Rejeitadas",hint:"Com motivo registrado",icon:<XCircle className="h-4 w-4"/>,filter:["status","rejected"],accent:"rose"},{key:"draft",title:"Rascunhos",hint:"Em preparação",icon:<Pencil className="h-4 w-4"/>,filter:["status","draft"],accent:"amber"}];

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
  const [filters, setFilters] = useState<QueueFilters>({ status: searchParams.get("questao") ? "" : searchParams.get("status") ?? "pending", limit: [12,24,48].includes(Number(searchParams.get("limit")))?Number(searchParams.get("limit")):12, offset: Math.max(0,Number(searchParams.get("offset"))||0), search: searchParams.get("search")||undefined, banca: searchParams.get("banca")||undefined, discipline: searchParams.get("discipline")||undefined, year: searchParams.get("year")||undefined, question_id:Number(searchParams.get("questao"))||undefined, duplicates:searchParams.get("duplicates")||undefined,conflict:searchParams.get("conflict")||undefined });
  const [state, setState] = useState<QueueState>({ results: [], total: 0, loading: true, error: null });
  const [selectedId, setSelectedId] = useState<number | null>(Number(searchParams.get("selecionada")||searchParams.get("questao"))||null);
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

  const [minExplanation,setMinExplanation]=useState(EXPLANATION_MIN);
  const [summary,setSummary]=useState<Record<string,number>>({});
  const [canReview,setCanReview]=useState(false);
  const [scanLimited,setScanLimited]=useState(false);
  const [confirmApproval,setConfirmApproval]=useState(false);
  const [shortcuts,setShortcuts]=useState(false);
  const [pendingHref,setPendingHref]=useState<string|null>(null);
  const allowLeave=useRef(false);
  const [pendingNavigation,setPendingNavigation]=useState<number|null>(null);
  const sequence=useRef(0),mutation=useRef(false);
  const selected = useMemo(
    () => state.results.find((item) => item.id === selectedId) ?? null,
    [state.results, selectedId],
  );

  const dirty=Boolean(selected&&explanation!==(selected.review_note||selected.explanation||""));
  const selectQuestion=useCallback((id:number|null)=>{if(mutation.current)return;if(dirty&&id!==selectedId&&id!==null){setPendingNavigation(id);return;}setSelectedId(id);},[dirty,selectedId]);
  useEffect(()=>{
    const guard=(event:BeforeUnloadEvent)=>{if(dirty&&!allowLeave.current){event.preventDefault();event.returnValue="";}};
    const guardLink=(event:MouseEvent)=>{if(!dirty||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.button!==0)return;const anchor=(event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement|null;if(!anchor||anchor.target==="_blank"||anchor.hasAttribute("download"))return;if(anchor.href===window.location.href)return;event.preventDefault();event.stopPropagation();setPendingHref(anchor.href);};
    window.addEventListener("beforeunload",guard);document.addEventListener("click",guardLink,true);
    return()=>{window.removeEventListener("beforeunload",guard);document.removeEventListener("click",guardLink,true);};
  },[dirty]);
  const loadQueue = useCallback(async () => {
    const id=++sequence.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const page = await content.queue({
        ...filters,
        source: selectedSource || undefined,
        search_run: runId ?? undefined,
      });
      if(id!==sequence.current)return;
      setMinExplanation(page.review_policy.min_explanation_chars);setSummary(page.overview);setCanReview(page.can_review);setScanLimited(page.duplicate_scan_limited);
      if(page.offset!==(filters.offset||0))setFilters(current=>({...current,offset:page.offset}));
      setState({ results: page.results, total: page.total, loading: false, error: null });
      setSelectedId((current) => (current && page.results.some((item) => item.id === current) ? current : page.results[0]?.id ?? null));
    } catch (err) {
      if(id!==sequence.current)return;
      const message = apiMessage((err as { response?: { data?: unknown } })?.response?.data, "Não foi possível carregar a fila.");
      setState({ results: [], total: 0, loading: false, error: message });
    }
  }, [filters, selectedSource, runId]);

  useEffect(() => {
    void (async () => {
      try {
        setSources(await content.sourceCatalog());
        setRejectionReasons(await content.rejectionReasons());
      } catch {
        setFeedback({ kind: "error", message: "Não foi possível carregar as fontes do conteúdo." });
      }
    })();
  }, []);

  useEffect(() => {
    const ref=sequence;++ref.current;
    const timer=window.setTimeout(()=>void loadQueue(),250);
    return()=>{window.clearTimeout(timer);++ref.current;};
  }, [loadQueue]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    ["status","search","banca","discipline","year","duplicates","conflict","limit","offset"].forEach(key=>{const value=filters[key as keyof QueueFilters];if(value!==undefined&&value!=="")params.set(key,String(value));else params.delete(key);});
    if(filters.status==="")params.set("status","");
    if(selectedSource)params.set("fonte",selectedSource);else params.delete("fonte");
    if(runId)params.set("busca",String(runId));else params.delete("busca");
    if(filters.question_id)params.set("questao",String(filters.question_id));else params.delete("questao");
    if(selectedId)params.set("selecionada",String(selectedId));else params.delete("selecionada");
    window.history.replaceState(window.history.state,"",`${window.location.pathname}?${params}${window.location.hash}`);
  },[filters,selectedSource,runId,selectedId]);

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
    if (selected) setExplanation(selected.review_note || selected.explanation || "");
  }, [selected]);

  const position = selected ? state.results.findIndex((item) => item.id === selected.id) + 1 : 0;
  const reviewed = run?.reviewed_count ?? 0;
  const runTotal = run?.questions_count ?? 0;
  const percent = runTotal > 0 ? Math.round((reviewed / runTotal) * 100) : 0;

  const advance = useCallback(
    (fromId: number) => {
      const index = state.results.findIndex((item) => item.id === fromId);
      const next = state.results[index + 1];
      if(next)selectQuestion(next.id);else if((filters.offset||0)+(filters.limit||12)<state.total)setFilters(current=>({...current,offset:(current.offset||0)+(current.limit||12)}));
    },
    [state.results,selectQuestion,filters.offset,filters.limit,state.total],
  );

  const decide = useCallback(
    async (action: "approve" | "reject" | "draft", payload: { reason?: string; reason_code?: string }, confirmed=false) => {
      if (!selected||mutation.current||!canReview||selected.status!=="pending") return;
      if(action==="approve"&&selected.conflict&&!confirmed){setConfirmApproval(true);return;}
      setConfirmApproval(false);
      mutation.current=true;
      setBusy(true);
      setFeedback(null);
      setExplanationInvalid(false);
      setReasonsInvalid(false);
      try {
        if (action === "draft") {
          await content.draft({ id: selected.id, note: explanation, updated_at:selected.updated_at });
          await loadQueue();
          setFeedback({ kind: "success", message: "Rascunho salvo." });
          return;
        }
        const body = { id: selected.id, updated_at: selected.updated_at, ...payload };
        const data = action === "approve"
          ? await content.approve({ ...body, explanation })
          : await content.reject({ ...body, reason: payload.reason ?? "", reason_code: payload.reason_code ?? "" });
        const updated = data.results[0];
        const index=state.results.findIndex(item=>item.id===updated.id);
        setSelectedId(state.results[index+1]?.id??state.results[index-1]?.id??null);
        setFeedback({kind:"success",message:`Questão #${updated.id} ${action==="approve"?"aprovada":"rejeitada"}.`});
        await loadQueue();
        if(runId){try{setRun(await content.run(runId));}catch{setRun(null);}}
      } catch (err) {
        const response = (err as { response?: { status?: number; data?: unknown } })?.response;
        const status = response?.status;
        const data = response?.data as { code?: string; explanation?: string[] } | undefined;
        if (status === 400 && Array.isArray(data?.explanation)) {
          setExplanationInvalid(true);
          explanationRef.current?.focus();
          setFeedback({
            kind: "error",
            message: apiMessage(data,"Revise o comentário antes de aprovar."),
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
          setFeedback({ kind: "info", message: "Esta questão já foi revisada. Seu comentário permanece nesta tela; copie-o antes de descartar as alterações e recarregar." });
          return;
        }
        if (status === 409) {
          setFeedback({ kind: "error", message: "Esta questão foi atualizada por outro revisor. Seu comentário permanece nesta tela; copie-o antes de descartar as alterações e recarregar." });
          return;
        }
        setFeedback({ kind: "error", message: "Falha ao salvar — tente novamente." });
      } finally {
        mutation.current=false;
        setBusy(false);
      }
    },
    [selected,explanation,loadQueue,canReview,state.results,runId],
  );

  const warnUnsaved=()=>{setFeedback({kind:"info",message:"Salve o rascunho ou descarte as alterações trocando de questão antes de alterar os filtros."});};
  const goNext = useCallback(() => {
    if (!selected) return;
    const index = state.results.findIndex((item) => item.id === selected.id);
    const next = state.results[index + 1];
    if (next) selectQuestion(next.id);
  }, [selected,state.results,selectQuestion]);

  const goPrevious = useCallback(() => {
    if (!selected) return;
    const index = state.results.findIndex((item) => item.id === selected.id);
    const previous = state.results[index - 1];
    if (previous) selectQuestion(previous.id);
  }, [selected,state.results,selectQuestion]);

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
      if (!shortcuts||busy||event.repeat||pendingNavigation!==null||pendingHref!==null||confirmApproval||event.target instanceof Element&&event.target.closest("[role=dialog]"))return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if ((event.key.toLowerCase()==="a"||event.key.toLowerCase()==="s")&&!canReview)return;
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
  }, [selected,decide,advance,goNext,goPrevious,rejectionReasons,shortcuts,busy,pendingNavigation,canReview,confirmApproval,pendingHref]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fila de revisão"
        description="Revise, aprove ou rejeite questões que já foram importadas para a fila."
        actions={
          <>
            <Button variant="outline" disabled={busy||dirty} onClick={() => void openHistory()}>
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
                  disabled={busy||dirty}
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

      <CatalogSummary label="Resumo geral da revisão" metrics={metrics} overview={summary} query={{status:filters.status??"pending"}} change={(_,value)=>{if(dirty){warnUnsaved();return;}setFilters(current=>({...current,status:value,offset:0,question_id:undefined}));}} clear={()=>{if(dirty){warnUnsaved();return;}setSelectedSource("");setRunId(null);setFilters({status:"",limit:12,offset:0});}}/>
      <FilterBar active={Boolean(selectedSource||runId||filters.search||filters.banca||filters.discipline||filters.year||filters.duplicates||filters.conflict||filters.question_id||filters.status!=="pending")} onClear={()=>{if(dirty){warnUnsaved();return;}setSelectedSource("");setRunId(null);setFilters({status:"pending",limit:12,offset:0});}}>
        <div className="min-w-0 space-y-2 xl:flex-1"><Label htmlFor="queue-search">Buscar na fila</Label><Input disabled={dirty||busy} id="queue-search" value={filters.search||""} onChange={event=>setFilters(current=>({...current,search:event.target.value,offset:0}))} placeholder="Enunciado ou comentário"/></div>
        <AdminFilterSelect disabled={dirty||busy} id="queue-status" label="Status" value={filters.status||""} options={[["all","Todos os status"],["pending","Pendentes"],["approved","Aprovadas"],["rejected","Rejeitadas"],["draft","Rascunhos"]]} onChange={value=>setFilters(current=>({...current,status:value,offset:0,question_id:undefined}))}/>
        <AdminFilterSelect disabled={dirty||busy} id="queue-source" label="Fonte" value={selectedSource} options={[["all","Todas as fontes"],...sources.map(source=>[source.slug,source.label] as [string,string])]} onChange={value=>{setSelectedSource(value);setRunId(null);setFilters(current=>({...current,offset:0,question_id:undefined}));}}/>
        {([["banca","Banca"],["discipline","Disciplina"],["year","Ano"]] as const).map(([key,label])=><div key={key} className="space-y-2"><Label htmlFor={`queue-${key}`}>{label}</Label><Input disabled={dirty||busy} id={`queue-${key}`} value={filters[key]||""} type={key==="year"?"number":"text"} onChange={event=>setFilters(current=>({...current,[key]:event.target.value,offset:0}))} className="w-full sm:w-36"/></div>)}
        <AdminFilterSelect disabled={dirty||busy} id="queue-quality" label="Comparação" value={filters.conflict?"conflict":filters.duplicates?"duplicates":""} options={[["all","Todas as questões"],["duplicates","Com parecidas"],["conflict","Conflito de gabarito"]]} onChange={value=>setFilters(current=>({...current,conflict:value==="conflict"?"1":undefined,duplicates:value==="duplicates"?"1":undefined,offset:0}))}/>
      </FilterBar>
      {scanLimited&&<Notice kind="info">O filtro de parecidas ou conflitos considera as primeiras 300 questões da prioridade atual. Refine por fonte, banca ou busca para examinar outro recorte.</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{state.total} questões encontradas · prioridade editorial preservada</span><label className="flex items-center gap-2"><input type="checkbox" checked={shortcuts} onChange={event=>setShortcuts(event.target.checked)}/>Ativar atalhos de revisão</label></div>
      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
        <QueueList
          hideFilters
          state={state}
          selectedId={selectedId}
          onSelect={(question) => selectQuestion(question.id)}
          filters={filters}
          onFiltersChange={setFilters}
          sources={sources}
          selectedSource={selectedSource}
          onSourceChange={setSelectedSource}
          runId={runId}
          onRunIdChange={setRunId}
          run={run}
          onOpenSearch={() => { window.location.href = "/admin/fontes-questoes"; }}
          onReload={() => {if(dirty){warnUnsaved();return;}void loadQueue();}}
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
                    {(filters.offset||0)+position} de {state.total} nesta fila
                  </>
                )}
              </p>
              <ReviewPanel
                key={selected.id}
                minExplanationChars={minExplanation}
                readOnly={!canReview}
                hasUnsavedChanges={dirty}
                onDiscard={()=>setPendingNavigation(selected.id)}
                onSaveDraft={()=>void decide("draft",{})}
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
                {dirty&&<span className="font-medium text-amber-700">Comentário não salvo. </span>}Atalhos: <kbd>A</kbd> aprovar · <kbd>R</kbd> rejeitar · <kbd>S</kbd> salvar rascunho ·{" "}
                <kbd>P</kbd> pular · <kbd>J</kbd>/<kbd>K</kbd> navegar.{" "}
                <a href={adminUrl("questions/question/")} className="underline">
                  Ver no admin do Django
                </a>
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <Inbox className="h-4 w-4" /> {state.loading ? "Carregando revisão..." : state.error ? "Falha ao carregar a revisão" : "Nenhuma questão selecionada"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Nenhuma questão selecionada neste recorte. Confira os filtros ou avance a página.
              </p>
              <Button className="mt-4" asChild><Link href="/admin/fontes-questoes">Buscar em fontes</Link></Button>
            </div>
          )}
        </section>
      </div>
      <ListPagination count={state.total} page={Math.floor((filters.offset||0)/(filters.limit||12))+1} pageSize={filters.limit||12} disabled={state.loading||busy||dirty} onPageChange={page=>setFilters(current=>({...current,offset:(page-1)*(current.limit||12)}))} onPageSizeChange={limit=>setFilters(current=>({...current,limit,offset:0}))}/>
      <ConfirmAction open={confirmApproval} title="Aprovar com conflito de gabarito?" description="Existem questões parecidas com gabarito diferente. Confira a comparação e o comentário antes de confirmar a aprovação." busy={busy} onClose={()=>setConfirmApproval(false)} onConfirm={()=>void decide("approve",{},true)}/>
      <ConfirmAction open={pendingNavigation!==null||pendingHref!==null} title="Descartar comentário não salvo?" description="Seu comentário foi alterado. Salve o rascunho antes de trocar de questão se desejar preservá-lo." busy={busy} onClose={()=>{setPendingNavigation(null);setPendingHref(null);}} onConfirm={()=>{if(pendingHref){allowLeave.current=true;window.location.assign(pendingHref);return;}setExplanation(selected?.review_note||selected?.explanation||"");setSelectedId(pendingNavigation);setPendingNavigation(null);}}/>
    </div>
  );
}
