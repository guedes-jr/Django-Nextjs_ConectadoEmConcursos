"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, CircleHelp, ClipboardCheck, Filter, List, MessageSquare, RotateCcw, Search, StickyNote, X } from "lucide-react";
import { QuestionContent } from "@/components/QuestionContent";
import { useMe } from "@/lib/useMe";

import {
  AnswerResult,
  Question,
  QuestionComment,
  answerQuestion,
  createComment,
  deleteComment,
  getNote,
  listComments,
  listQuestionFacets,
  listQuestions,
  reportQuestion,
  requestExplanation,
  saveNote,
  submitSimulation,
  toggleFavorite,
  toggleReview,
} from "@/lib/questions";


type OpenPanel = "note" | "comments" | "report" | null;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;
type StudyMode = "practice" | "simulation";
type ProgressFilter = "all" | "unanswered" | "correct" | "incorrect" | "review";
type ReadingSize = "normal" | "large";

type SavedSession = {
  page?: number;
  pageSize?: number;
  search?: string;
  discipline?: string;
  banca?: string;
  year?: string;
  favoritesOnly?: boolean;
  examId?: number;
  progress?: ProgressFilter;
  mode?: StudyMode;
  focusIndex?: number;
  focusMode?: boolean;
  readingSize?: ReadingSize;
  comfortableWidth?: boolean;
  selected?: Record<number, number>;
  simulationSelected?: Record<number, number>;
  results?: Record<number, AnswerResult>;
  simulationResults?: Record<number, AnswerResult>;
  simulationFinished?: boolean;
};

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (typeof response?.data === "object" && response.data) {
      const value = Object.values(response.data).flat().find((item) => typeof item === "string");
      if (typeof value === "string") return value;
    }
  }
  return "Não foi possível concluir a operação.";
}

export default function QuestionsPage() {
  const { me, isLoading: meLoading } = useMe();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [bancas, setBancas] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [banca, setBanca] = useState("");
  const [year, setYear] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [examId, setExamId] = useState<number | undefined>();
  const [queryReady, setQueryReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [restoredSession, setRestoredSession] = useState(false);
  const [progress, setProgress] = useState<ProgressFilter>("all");
  const [mode, setMode] = useState<StudyMode>("practice");
  const [focusIndex, setFocusIndex] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [readingSize, setReadingSize] = useState<ReadingSize>("normal");
  const [comfortableWidth, setComfortableWidth] = useState(false);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [simulationSelected, setSimulationSelected] = useState<Record<number, number>>({});
  const [results, setResults] = useState<Record<number, AnswerResult>>({});
  const [simulationResults, setSimulationResults] = useState<Record<number, AnswerResult>>({});
  const [simulationFinished, setSimulationFinished] = useState(false);
  const [simulationSubmitting, setSimulationSubmitting] = useState(false);
  const [openPanels, setOpenPanels] = useState<Record<number, OpenPanel>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, QuestionComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<number, string>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [requestedComments, setRequestedComments] = useState<Record<number, boolean>>({});
  const [answering, setAnswering] = useState<Record<number, boolean>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (hydrated || meLoading || !me) return;
    const value = new URLSearchParams(window.location.search).get("exam");
    const urlDiscipline = new URLSearchParams(window.location.search).get("discipline");
    const urlProgress = new URLSearchParams(window.location.search).get("progress");
    const urlExam = value && /^\d+$/.test(value) ? Number(value) : undefined;
    let saved: SavedSession | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(`cq_question_session_v2_${me.id}`) || "null") as SavedSession | null;
    } catch { /* An invalid saved session should not block the page. */ }
    if (saved && (!urlExam || saved.examId === urlExam)) {
      setRestoredSession(true);
      const restoredPageSize = saved.pageSize && PAGE_SIZE_OPTIONS.includes(saved.pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? saved.pageSize
        : 20;
      setPage(Number.isInteger(saved.page) && (saved.page ?? 0) > 0 ? saved.page! : 1);
      setPageSize(restoredPageSize);
      setSearch(saved.search || "");
      setDiscipline(saved.discipline || "");
      setBanca(saved.banca || "");
      setYear(saved.year || "");
      setFavoritesOnly(Boolean(saved.favoritesOnly));
      setProgress(saved.progress || "all");
      setMode(saved.mode === "simulation" ? "simulation" : "practice");
      setFocusIndex(Math.max(0, Math.min(restoredPageSize - 1, saved.focusIndex || 0)));
      setFocusMode(saved.focusMode === true);
      setReadingSize(saved.readingSize === "large" ? "large" : "normal");
      setComfortableWidth(Boolean(saved.comfortableWidth));
      setSelected(saved.selected || {});
      setSimulationSelected(saved.simulationSelected || {});
      setResults(saved.results || {});
      setSimulationResults(saved.simulationResults || {});
      setSimulationFinished(Boolean(saved.simulationFinished));
    }
    setExamId(urlExam ?? saved?.examId);
    if (urlDiscipline || urlProgress) {
      setPage(1);
      setFocusIndex(0);
      setMode("practice");
      if (urlDiscipline) setDiscipline(urlDiscipline);
      else if (urlProgress === "review") setDiscipline("");
      if (urlProgress === "review") setProgress("review");
    }
    setQueryReady(true);
    setHydrated(true);
  }, [hydrated, me, meLoading]);

  useEffect(() => {
    if (!hydrated || !me) return;
    const snapshot: SavedSession = {
      page, pageSize, search, discipline, banca, year, favoritesOnly, examId, progress, mode,
      focusIndex, focusMode, readingSize, comfortableWidth, selected,
      simulationSelected, results, simulationResults, simulationFinished,
    };
    try { localStorage.setItem(`cq_question_session_v2_${me.id}`, JSON.stringify(snapshot)); }
    catch { /* Studying still works when local storage is full or unavailable. */ }
  }, [hydrated, me, page, pageSize, search, discipline, banca, year, favoritesOnly, examId, progress, mode, focusIndex, focusMode, readingSize, comfortableWidth, selected, simulationSelected, results, simulationResults, simulationFinished]);

  useEffect(() => {
    if (mode === "simulation" && questions.length > 0 && questions.every((question) => simulationResults[question.id])) {
      setSimulationFinished(true);
    }
  }, [mode, questions, simulationResults]);

  useEffect(() => {
    void listQuestionFacets().then((facets) => {
      setDisciplines(facets.disciplines);
      setBancas(facets.bancas);
      setYears(facets.years);
    }).catch(() => {
      setDisciplines([]);
      setBancas([]);
      setYears([]);
    });
  }, []);

  useEffect(() => {
    if (!queryReady) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const data = await listQuestions({
          search: search || undefined,
          discipline: discipline || undefined,
          banca: banca || undefined,
          year: year || undefined,
          favorites: favoritesOnly || undefined,
          progress: progress === "all" ? undefined : progress,
          exam: examId,
          page,
          page_size: pageSize,
        });
        if (cancelled) return;
        setQuestions(data.results);
        setTotal(data.count);
        setFocusIndex((current) => current >= data.results.length ? 0 : current);
      } catch (requestError) {
        if (cancelled) return;
        setQuestions([]);
        setError(getErrorMessage(requestError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      cancelled = true;
    };
  }, [banca, discipline, examId, favoritesOnly, page, pageSize, progress, queryReady, refreshVersion, search, year]);

  async function submitAnswer(question: Question) {
    const answer = selected[question.id];
    if (answer === undefined || answering[question.id]) return;
    setAnswering((current) => ({ ...current, [question.id]: true }));
    try {
      const result = await answerQuestion(question.id, answer);
      setResults((current) => ({ ...current, [question.id]: result }));
      setQuestions((current) => current.map((item) => item.id === question.id ? {
        ...item, latest_answer: answer, latest_is_correct: result.is_correct,
        is_marked: false, review_due: false, next_review_at: result.next_review_at,
      } : item));
    } catch (requestError) {
      setMessages((current) => ({ ...current, [question.id]: getErrorMessage(requestError) }));
    } finally {
      setAnswering((current) => ({ ...current, [question.id]: false }));
    }
  }

  async function favorite(question: Question) {
    const result = await toggleFavorite(question.id);
    if (favoritesOnly && !result.is_favorite) {
      if (questions.length === 1 && page > 1) setPage(page - 1);
      else setRefreshVersion((current) => current + 1);
    } else {
      setQuestions((current) => current.map((item) =>
        item.id === question.id ? { ...item, is_favorite: result.is_favorite } : item
      ));
    }
  }

  async function markForReview(question: Question) {
    try {
      const state = await toggleReview(question.id);
      setQuestions((current) => current.map((item) => item.id === question.id
        ? { ...item, is_marked: state.is_marked, review_due: state.review_due, next_review_at: state.next_review_at }
        : item));
      if (progress === "review" && !state.review_due) setRefreshVersion((current) => current + 1);
    } catch (requestError) {
      setMessages((current) => ({ ...current, [question.id]: getErrorMessage(requestError) }));
    }
  }

  async function finishSimulation() {
    if (simulationSubmitting || questions.some((question) => simulationSelected[question.id] === undefined)) return;
    setSimulationSubmitting(true);
    setError(null);
    try {
      const feedback = await submitSimulation(questions.map((question) => ({
        question_id: question.id, selected_answer: simulationSelected[question.id],
      })));
      setSimulationResults((current) => ({ ...current, ...Object.fromEntries(feedback.map((item) => [item.question_id, item])) }));
      setSimulationFinished(true);
      setFocusIndex(0);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSimulationSubmitting(false);
    }
  }

  function resetToFirstPage() {
    setPage(1);
    setFocusIndex(0);
    setSimulationFinished(false);
  }

  function openExamQuestions(value: number) {
    setExamId(value);
    setBanca("");
    resetToFirstPage();
  }

  function switchMode(nextMode: StudyMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setFocusIndex(0);
    if (nextMode === "simulation") {
      setSimulationSelected((current) => {
        const next = { ...current };
        questions.forEach((question) => delete next[question.id]);
        return next;
      });
      setSimulationResults((current) => {
        const next = { ...current };
        questions.forEach((question) => delete next[question.id]);
        return next;
      });
      setSimulationFinished(false);
    }
  }

  function retryQuestion(questionId: number) {
    setResults((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setSelected((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  function restartSimulation() {
    setSimulationSelected((current) => {
      const next = { ...current };
      questions.forEach((question) => delete next[question.id]);
      return next;
    });
    setSimulationResults((current) => {
      const next = { ...current };
      questions.forEach((question) => delete next[question.id]);
      return next;
    });
    setSimulationFinished(false);
    setFocusIndex(0);
  }

  async function openPanel(questionId: number, panel: OpenPanel) {
    setOpenPanels((current) => ({ ...current, [questionId]: panel }));
    if (panel === "note" && notes[questionId] === undefined) {
      const content = await getNote(questionId);
      setNotes((current) => ({ ...current, [questionId]: content }));
    }
    if (panel === "comments" && comments[questionId] === undefined) {
      const loadedComments = await listComments(questionId);
      setComments((current) => ({ ...current, [questionId]: loadedComments }));
    }
  }

  async function submitComment(event: FormEvent, questionId: number) {
    event.preventDefault();
    const content = commentDrafts[questionId]?.trim();
    if (!content) return;
    const comment = await createComment(questionId, content);
    setComments((current) => ({
      ...current,
      [questionId]: [...(current[questionId] ?? []), comment],
    }));
    setCommentDrafts((current) => ({ ...current, [questionId]: "" }));
  }

  async function removeComment(questionId: number, commentId: number) {
    await deleteComment(commentId);
    setComments((current) => ({
      ...current,
      [questionId]: (current[questionId] ?? []).filter((comment) => comment.id !== commentId),
    }));
  }

  async function submitReport(event: FormEvent, questionId: number) {
    event.preventDefault();
    try {
      await reportQuestion(questionId, reportDrafts[questionId] ?? "");
      setReportDrafts((current) => ({ ...current, [questionId]: "" }));
      setMessages((current) => ({ ...current, [questionId]: "Erro enviado para análise." }));
    } catch (requestError) {
      setMessages((current) => ({ ...current, [questionId]: getErrorMessage(requestError) }));
    }
  }

  async function askForExplanation(questionId: number) {
    try {
      await requestExplanation(questionId);
      setRequestedComments((current) => ({ ...current, [questionId]: true }));
    } catch (requestError) {
      setMessages((current) => ({ ...current, [questionId]: getErrorMessage(requestError) }));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstPageButton = Math.max(1, Math.min(page - 2, totalPages - 4));
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => firstPageButton + index
  );

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
    setFocusIndex(0);
    setSimulationFinished(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToNextQuestion() {
    if (focusIndex < questions.length - 1) {
      setFocusIndex((current) => current + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (page < totalPages) {
      goToPage(page + 1);
    }
  }

  const completedCount = questions.filter((question) => mode === "simulation"
    ? simulationSelected[question.id] !== undefined
    : results[question.id] !== undefined).length;
  const simulationScore = questions.filter((question) => simulationResults[question.id]?.is_correct).length;

  return (
    <main className="min-h-screen bg-[#f5f7fc] px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Pratique e evolua</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{examId ? "Questões da prova" : "Questões de concursos"}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Escolha um tema, responda no seu ritmo e aprenda com o gabarito comentado.</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {loading ? "Buscando questões..." : `${total} ${total === 1 ? "questão encontrada" : "questões encontradas"}`}
          </div>
        </header>

        <section aria-label="Filtros de questões" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_35px_rgba(19,43,87,0.05)] dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Filter size={18} /></span><div><h2 className="font-bold">Encontre a questão certa</h2><p className="text-xs text-slate-500 dark:text-slate-400">Combine os filtros para focar no que precisa estudar.</p></div></div>
            <button type="button" onClick={() => { setSearch(""); setDiscipline(""); setBanca(""); setYear(""); setFavoritesOnly(false); setProgress("all"); resetToFirstPage(); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><RotateCcw size={14} /> Limpar filtros</button>
          </div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Buscar no enunciado
            <span className="relative mt-2 block"><Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); resetToFirstPage(); }} placeholder="Digite uma palavra ou expressão" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-normal text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-950" /></span>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Disciplina", value: discipline, onChange: setDiscipline, items: disciplines.map((item) => ({ value: item, label: item })), all: "Todas as disciplinas" },
              { label: "Banca", value: banca, onChange: setBanca, items: bancas.map((item) => ({ value: item, label: item })), all: "Todas as bancas" },
              { label: "Ano", value: year, onChange: setYear, items: years.map((item) => ({ value: String(item), label: String(item) })), all: "Todos os anos" },
              { label: "Situação", value: progress, onChange: (value: string) => setProgress((value || "all") as ProgressFilter), items: [
                { value: "unanswered", label: "Não respondidas" }, { value: "incorrect", label: "Errei" },
                { value: "correct", label: "Acertei" }, { value: "review", label: "Para revisão" },
              ], all: "Todas as situações" },
            ].map((filter) => (
              <label key={filter.label} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{filter.label}
                <span className="relative mt-2 block"><select value={filter.value === "all" ? "" : filter.value} onChange={(event) => { filter.onChange(event.target.value); resetToFirstPage(); }} className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-950"><option value="">{filter.all}</option>{filter.items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" /></span>
              </label>
            ))}
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Minha seleção
              <span className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><input type="checkbox" checked={favoritesOnly} onChange={(event) => { setFavoritesOnly(event.target.checked); resetToFirstPage(); }} className="accent-blue-600" /> Apenas favoritas</span>
            </label>
          </div>
        </section>

        <section aria-label="Sessão de estudo" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Modo de resolução">
              <button type="button" onClick={() => switchMode("practice")} aria-pressed={mode === "practice"} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${mode === "practice" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}><BookOpen size={17} /> Praticar</button>
              <button type="button" onClick={() => switchMode("simulation")} aria-pressed={mode === "simulation"} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${mode === "simulation" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}><ClipboardCheck size={17} /> Simulado</button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              {restoredSession && <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Sessão retomada</span>}
              <span>{completedCount} de {questions.length} {mode === "simulation" ? "marcadas" : "respondidas"}</span>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="Progresso nesta página" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={questions.length || 1}><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${questions.length ? (completedCount / questions.length) * 100 : 0}%` }} /></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">{mode === "simulation" ? "No simulado, o gabarito aparece somente após finalizar esta página." : "Na prática, cada resposta mostra a correção e o comentário imediatamente."}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button type="button" onClick={() => setFocusMode((current) => !current)} aria-pressed={focusMode} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 font-semibold dark:border-slate-700"><List size={15} /> {focusMode ? "Ver lista" : "Focar uma questão"}</button>
              <label className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 font-semibold dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Por página</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setFocusIndex(0); setSimulationFinished(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-8 w-auto appearance-none rounded-md border-0 bg-transparent py-0 pl-1 pr-1 text-slate-800 outline-none dark:text-slate-100" aria-label="Questões por página">{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
              <button type="button" onClick={() => setReadingSize((current) => current === "normal" ? "large" : "normal")} aria-pressed={readingSize === "large"} className="min-h-10 rounded-lg border border-slate-200 px-3 font-semibold dark:border-slate-700">Texto {readingSize === "large" ? "A+" : "A"}</button>
              <button type="button" onClick={() => setComfortableWidth((current) => !current)} aria-pressed={comfortableWidth} className="min-h-10 rounded-lg border border-slate-200 px-3 font-semibold dark:border-slate-700">{comfortableWidth ? "Largura normal" : "Leitura confortável"}</button>
            </div>
          </div>
        </section>

        {mode === "simulation" && simulationFinished && questions.length > 0 && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
            <div><strong className="text-lg">Simulado concluído: {simulationScore} de {questions.length} acertos</strong><p className="mt-1 text-sm">Agora você pode revisar cada questão e ler o gabarito comentado.</p></div>
            <button type="button" onClick={restartSimulation} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-300 px-4 text-sm font-semibold dark:border-blue-700"><RotateCcw size={16} /> Novo simulado</button>
          </div>
        )}

        {loading && <p role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">Carregando questões…</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}

        <section className={`space-y-5 ${comfortableWidth ? "mx-auto max-w-4xl" : ""}`}>
          {!loading && questions.map((question, index) => {
            if (focusMode && index !== focusIndex) return null;
            const result = mode === "practice" ? results[question.id] : simulationFinished ? simulationResults[question.id] : undefined;
            const currentSelection = mode === "practice" ? selected[question.id] : simulationSelected[question.id];
            const panel = openPanels[question.id];
            const examId = question.exam_id;
            const examDescription = [
              question.exam_role ? `Cargo: ${question.exam_role}` : "",
              question.exam_title ? `Prova: ${question.exam_title}` : "",
              question.exam_institution ? `Órgão: ${question.exam_institution}` : "",
            ].filter(Boolean).join(" · ");
            return (
              <article key={question.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(19,43,87,0.055)] dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-lg bg-blue-600 px-2.5 py-1.5 font-bold text-white">Questão {(page - 1) * pageSize + index + 1}</span>
                      <span className="rounded-lg bg-slate-200/80 px-2.5 py-1.5 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">ID #{question.id}</span>
                      <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">{question.discipline}</span>
                      <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">Ano {question.year}</span>
                      <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">{question.banca}</span>
                    </div>
                    {examDescription && (
                      examId !== null ? (
                        <Link
                          href={`/questions?exam=${examId}`}
                          onClick={() => openExamQuestions(examId)}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:underline dark:text-slate-400"
                        >
                          {examDescription} <ArrowRight size={13} />
                        </Link>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{examDescription}</p>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {mode === "practice" && (result || question.latest_answer !== null) && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Respondida</span>}
                    {mode === "simulation" && !simulationFinished && currentSelection !== undefined && <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Marcada</span>}
                    <button type="button" onClick={() => void favorite(question)} aria-label={question.is_favorite ? "Remover dos favoritos" : "Favoritar questão"} title={question.is_favorite ? "Remover dos favoritos" : "Favoritar questão"} className={`rounded-lg p-2 transition hover:bg-amber-50 dark:hover:bg-slate-800 ${question.is_favorite ? "text-amber-500" : "text-slate-400"}`}><Bookmark className="h-5 w-5" fill={question.is_favorite ? "currentColor" : "none"} /></button>
                  </div>
                </div>
                <div className="px-5 py-6 sm:px-7">
                <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400"><CircleHelp size={15} /> Enunciado</div>
                <QuestionContent text={question.statement} className={`font-medium leading-relaxed text-slate-800 dark:text-slate-100 ${readingSize === "large" ? "text-lg sm:text-xl" : "text-[15px] sm:text-base"}`} />
                <div className="mt-7 space-y-2.5" role="radiogroup" aria-label={`Alternativas da questão ${(page - 1) * pageSize + index + 1}`}>
                  {question.options.map((option, optionIndex) => {
                    const isCorrect = result?.correct_answer === optionIndex;
                    const isWrong = result && result.selected_answer === optionIndex && !result.is_correct;
                    const isSelected = currentSelection === optionIndex;
                    return (
                      <label key={`${question.id}-${optionIndex}`} className={`flex cursor-pointer items-baseline gap-2 rounded-2xl px-4 py-3.5 leading-6 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 ${readingSize === "large" ? "text-base sm:text-lg" : "text-sm"} ${isCorrect ? "bg-emerald-50 dark:bg-emerald-950/50" : isWrong ? "bg-red-50 dark:bg-red-950/50" : result ? "cursor-default" : "hover:bg-slate-100/70 dark:hover:bg-slate-800/60"}`}>
                        <input type="radio" name={`question-${question.id}`} checked={isSelected} disabled={Boolean(result)} onChange={() => mode === "practice" ? setSelected((current) => ({ ...current, [question.id]: optionIndex })) : setSimulationSelected((current) => ({ ...current, [question.id]: optionIndex }))} className="sr-only" />
                        <span className={`inline-flex h-5 shrink-0 items-center justify-center rounded-lg px-3 text-xs font-extrabold leading-none ${isCorrect ? "bg-emerald-600 text-white" : isWrong ? "bg-red-600 text-white" : isSelected ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{String.fromCharCode(97 + optionIndex)})</span>
                        <QuestionContent text={option} className="min-w-0 flex-1 text-slate-700 dark:text-slate-200" />
                        {isCorrect && <Check size={18} className="mt-1 shrink-0 text-emerald-700 dark:text-emerald-300" />}
                        {isWrong && <X size={18} className="mt-1 shrink-0 text-red-700 dark:text-red-300" />}
                      </label>
                    );
                  })}
                </div>
                {mode === "practice" && !result ? (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Selecione uma alternativa para conferir sua resposta.</p><button type="button" onClick={() => void submitAnswer(question)} disabled={selected[question.id] === undefined || answering[question.id]} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{answering[question.id] ? "Corrigindo..." : "Responder questão"} <ArrowRight size={17} /></button></div>
                ) : result ? (
                  <div role="status" className={`mt-7 overflow-hidden rounded-2xl border ${result.is_correct ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30"}`}>
                    <div className="flex items-center justify-between gap-3 border-b border-current/10 px-5 py-4"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${result.is_correct ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{result.is_correct ? <Check size={19} /> : <X size={19} />}</span><div><strong className="block text-sm font-bold text-slate-900 dark:text-slate-100">{result.is_correct ? "Você acertou!" : "Vamos revisar esta questão"}</strong><p className="text-xs text-slate-600 dark:text-slate-300">Gabarito: alternativa {String.fromCharCode(97 + result.correct_answer)})</p></div></div><button type="button" onClick={() => setExpandedExplanations((current) => ({ ...current, [question.id]: !current[question.id] }))} aria-expanded={Boolean(expandedExplanations[question.id])} className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-600 transition-colors hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"><span>Gabarito comentado</span><ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${expandedExplanations[question.id] ? "rotate-180" : ""}`} /></button></div>
                {expandedExplanations[question.id] && (result.explanation ? <QuestionContent text={result.explanation} className="px-5 py-4 text-sm leading-7 text-slate-700 dark:text-slate-200" /> : <div className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300"><p>Esta questão ainda não possui comentário cadastrado.</p><button type="button" onClick={() => void askForExplanation(question.id)} disabled={requestedComments[question.id]} className="mt-2 min-h-10 rounded-lg border border-slate-300 px-3 font-semibold text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:text-blue-300">{requestedComments[question.id] ? "Comentário solicitado" : "Solicitar comentário"}</button></div>)}
                </div>
                ) : <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">{currentSelection === undefined ? "Selecione uma alternativa. A correção virá ao finalizar o simulado." : "Resposta marcada. Continue até finalizar o simulado."}</p>}
                {mode === "practice" && result && <button type="button" onClick={() => retryQuestion(question.id)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"><RotateCcw size={16} /> Tentar novamente</button>}
                </div>

                {(mode === "practice" || simulationFinished) && <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
                  <button type="button" onClick={() => void markForReview(question)} aria-pressed={question.is_marked} className={`flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${question.is_marked ? "font-semibold text-amber-700 dark:text-amber-300" : ""}`}><Bookmark className="h-4 w-4" fill={question.is_marked ? "currentColor" : "none"} /> {question.is_marked ? "Na revisão" : "Revisar depois"}</button>
                  <button onClick={() => void openPanel(question.id, panel === "note" ? null : "note")} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><StickyNote className="h-4 w-4" /> Anotação</button>
                  <button onClick={() => void openPanel(question.id, panel === "comments" ? null : "comments")} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><MessageSquare className="h-4 w-4" /> Comentários ({comments[question.id]?.length ?? question.comment_count})</button>
                  <button onClick={() => void openPanel(question.id, panel === "report" ? null : "report")} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><AlertTriangle className="h-4 w-4" /> Informar erro</button>
                </div>}

                {(mode === "practice" || simulationFinished) && <div className="px-5 pb-5 sm:px-7">
                {panel === "note" && <div className="mt-4"><textarea value={notes[question.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Sua anotação privada" maxLength={250} wrap="soft" className="min-h-24 w-full rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700" /><div className="mt-1 text-right text-xs text-slate-400"><span>{(notes[question.id] ?? "").length}/250</span></div><button onClick={async () => { await saveNote(question.id, notes[question.id] ?? ""); setMessages((current) => ({ ...current, [question.id]: "Anotação salva." })); }} className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">Salvar anotação</button></div>}

                {panel === "comments" && <div className="mt-4 space-y-3">{(comments[question.id] ?? []).map((comment) => <div key={comment.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><div className="flex justify-between"><strong>{comment.author}</strong>{comment.is_owner && <button onClick={() => void removeComment(question.id, comment.id)} className="text-xs text-red-600">Excluir</button>}</div><p className="mt-1 whitespace-pre-wrap">{comment.content}</p></div>)}<form onSubmit={(event) => void submitComment(event, question.id)} className="space-y-2"><textarea value={commentDrafts[question.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Adicionar comentário" wrap="soft" maxLength={250} className="min-h-20 w-full rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700" /><div className="text-right text-xs text-slate-400"><span>{(commentDrafts[question.id] ?? "").length}/250</span></div><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Enviar</button></form></div>}

                {panel === "report" && <form onSubmit={(event) => void submitReport(event, question.id)} className="mt-4"><textarea value={reportDrafts[question.id] ?? ""} onChange={(event) => setReportDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Descreva o problema encontrado (mínimo de 10 caracteres)" wrap="soft" maxLength={5000} className="min-h-24 w-full rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700" /><div className="mt-1 text-right text-xs text-slate-400"><span>{(reportDrafts[question.id] ?? "").length}/5000</span></div><button className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white">Enviar relatório</button></form>}
                {messages[question.id] && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{messages[question.id]}</p>}
                </div>}
              </article>
            );
          })}
          {!loading && !error && questions.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">Nenhuma questão encontrada.</p>}
        </section>
        {!loading && !error && questions.length > 0 && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 ${comfortableWidth ? "mx-auto max-w-4xl" : ""}`}>
            {focusMode ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => { setFocusIndex((current) => Math.max(0, current - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={focusIndex === 0} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:opacity-40 dark:border-slate-700"><ArrowLeft size={16} /> Anterior</button>
                <span className="px-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{focusIndex + 1} de {questions.length}</span>
                <button type="button" onClick={goToNextQuestion} disabled={focusIndex === questions.length - 1 && page === totalPages} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:opacity-40 dark:border-slate-700">Próxima questão <ArrowRight size={16} /></button>
              </div>
            ) : <p className="text-sm text-slate-500 dark:text-slate-400">{questions.length} questões nesta página</p>}
            {mode === "simulation" && !simulationFinished && (
              <button type="button" onClick={() => void finishSimulation()} disabled={completedCount !== questions.length || simulationSubmitting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"><ClipboardCheck size={17} /> {simulationSubmitting ? "Finalizando..." : "Finalizar simulado"}</button>
            )}
          </div>
        )}
        {!loading && !error && total > 0 && (
          <nav aria-label="Paginação das questões" className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Questões {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => goToPage(page - 1)} disabled={page === 1} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Anterior</button>
              {visiblePages.map((number) => (
                <button key={number} type="button" onClick={() => goToPage(number)} aria-label={`Página ${number}`} aria-current={number === page ? "page" : undefined} className={`min-w-10 rounded-lg px-3 py-2 text-sm font-semibold ${number === page ? "bg-blue-600 text-white" : "border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
                  {number}
                </button>
              ))}
              <button type="button" onClick={() => goToPage(page + 1)} disabled={page === totalPages} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Próxima</button>
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}
