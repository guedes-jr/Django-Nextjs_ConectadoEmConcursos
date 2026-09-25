"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock,
  FolderDown,
  History,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Trophy,
  XCircle,
} from "lucide-react";
import { QuestionContent } from "@/components/QuestionContent";
import { Explanation } from "@/components/Explanation";

import { listQuestionFacets, submitSimulation, SimulationResult } from "@/lib/questions";
import { listExams, Exam } from "@/lib/exams";
import {
  createSimulationTemplate,
  deleteSimulation,
  deleteSimulationTemplate,
  listSimulationTemplates,
  listSimulations,
  SimulationQuestion,
  SimulationRun,
  SimulationTemplate,
  startSimulation,
  submitSimulationSession,
} from "@/lib/simulations";

const COUNT_OPTIONS = [10, 20, 30, 50];
const TIME_OPTIONS = [15, 30, 45, 60, 90];

function letterFor(index: number) {
  return `${String.fromCharCode(97 + index)})`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function SimulacoesPage() {
  const [step, setStep] = useState<"config" | "playing" | "result">("config");
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [bancas, setBancas] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examSearch, setExamSearch] = useState("");

  const [discipline, setDiscipline] = useState("");
  const [banca, setBanca] = useState("");
  const [year, setYear] = useState("");
  const [selectedExams, setSelectedExams] = useState<number[]>([]);
  const [count, setCount] = useState(20);
  const [fullExam, setFullExam] = useState(false);
  const [timeLimit, setTimeLimit] = useState(0);

  const [templates, setTemplates] = useState<SimulationTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const [session, setSession] = useState<Awaited<ReturnType<typeof startSimulation>> | null>(null);
  const [questions, setQuestions] = useState<SimulationQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timeUsed, setTimeUsed] = useState(0);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [recent, setRecent] = useState<SimulationRun[]>([]);
  const [deletingRecentId, setDeletingRecentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmBlank, setConfirmBlank] = useState<number | null>(null);

  const startedAtMs = useRef(0);
  const deadlineMs = useRef<number | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [facets, examList, runs, savedTemplates] = await Promise.all([
          listQuestionFacets(),
          listExams(),
          listSimulations(),
          listSimulationTemplates(),
        ]);
        if (cancelled) return;
        setDisciplines(facets.disciplines);
        setBancas(facets.bancas);
        setYears(facets.years);
        setExams(examList);
        setRecent(runs.slice(0, 5));
        setTemplates(savedTemplates);
      } catch {
        // não bloqueia a página de configuração
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleExams = useMemo(() => {
    const term = examSearch.trim().toLowerCase();
    const base = banca
      ? exams.filter((exam) => exam.banca.toLowerCase() === banca.toLowerCase())
      : exams;
    if (!term) return base;
    return base.filter(
      (exam) =>
        exam.title.toLowerCase().includes(term) ||
        exam.institution.toLowerCase().includes(term) ||
        exam.role.toLowerCase().includes(term),
    );
  }, [exams, examSearch, banca]);

  const changeBanca = (value: string) => {
    setBanca(value);
    if (!value) return;
    const match = value.toLowerCase();
    setSelectedExams((current) =>
      current.filter((id) => {
        const exam = exams.find((item) => item.id === id);
        return exam ? exam.banca.toLowerCase() === match : false;
      }),
    );
  };

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const data = await startSimulation({
        discipline: discipline || undefined,
        exam_ids: selectedExams,
        banca: banca || undefined,
        year: year ? Number(year) : null,
        count: fullExam ? null : count,
        full_exam: fullExam,
        time_limit_minutes: timeLimit || null,
      });
      if (data.questions.length === 0) {
        setError("Nenhuma questão disponível com esses critérios.");
        return;
      }
      startedAtMs.current = Date.now();
      if (data.time_limit_minutes) {
        deadlineMs.current = new Date(data.started_at).getTime() + data.time_limit_minutes * 60_000;
        setSecondsLeft(data.time_limit_minutes * 60);
      } else {
        deadlineMs.current = null;
        setSecondsLeft(null);
      }
      setSession(data);
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(null));
      setIndex(0);
      setResults([]);
      setStep("playing");
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail ?? "Não foi possível montar o simulado.");
    } finally {
      setStarting(false);
    }
  }, [discipline, selectedExams, banca, year, count, fullExam, timeLimit]);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const payload = questions.flatMap((item, i) =>
        answers[i] === null ? [] : [{ question_id: item.id, selected_answer: answers[i] as number }],
      );
      if (payload.length === 0 && !session) {
        setError("Responda pelo menos uma questão antes de concluir.");
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
      const submitted = session
        ? await submitSimulationSession(session.simulation_id, payload)
        : await submitSimulation(payload);
      setResults(submitted);
      setTimeUsed(Math.round((Date.now() - startedAtMs.current) / 1000));
      setStep("result");
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail ?? "Não foi possível enviar o simulado.");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [questions, answers, session]);

  useEffect(() => {
    if (step !== "playing" || deadlineMs.current == null) return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.round((deadlineMs.current! - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        window.clearInterval(timer);
        void submit();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [step, submit]);

  const answeredCount = useMemo(
    () => answers.filter((value) => value !== null).length,
    [answers],
  );

  const question = questions[index];

  const chooseOption = (optionIndex: number) => {
    setAnswers((current) => {
      const next = [...current];
      next[index] = optionIndex;
      return next;
    });
  };

  const finish = () => {
    if (submitting) return;
    const blank = questions.length - answeredCount;
    if (blank > 0) {
      setConfirmBlank(blank);
      return;
    }
    void submit();
  };

  const toggleExam = (examId: number) => {
    setSelectedExams((current) =>
      current.includes(examId)
        ? current.filter((id) => id !== examId)
        : [...current, examId],
    );
  };

  const loadTemplate = (value: string) => {
    const id = Number(value);
    setTemplateId(Number.isFinite(id) && id > 0 ? id : null);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setDiscipline(template.discipline || "");
    setBanca(template.banca || "");
    setYear(template.year != null ? String(template.year) : "");
    setSelectedExams(template.exam_ids || []);
    setCount(template.count ?? 20);
    setFullExam(Boolean(template.full_exam));
    setTimeLimit(template.time_limit_minutes ?? 0);
    setError(null);
    setTemplateError(null);
  };

  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      setTemplateError("Dê um nome para o filtro salvo.");
      return;
    }
    setSavingTemplate(true);
    setTemplateError(null);
    try {
      const created = await createSimulationTemplate({
        name,
        discipline,
        exam_ids: selectedExams,
        banca,
        year: year ? Number(year) : null,
        count: fullExam ? null : count,
        full_exam: fullExam,
        time_limit_minutes: timeLimit || null,
      });
      const updated = [created, ...templates].filter(
        (item, i, arr) => arr.findIndex((other) => other.id === item.id) === i,
      );
      setTemplates(updated);
      setTemplateId(created.id);
      setTemplateName("");
    } catch {
      setTemplateError("Não foi possível salvar o filtro.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const removeTemplate = async () => {
    if (!templateId) return;
    try {
      await deleteSimulationTemplate(templateId);
      setTemplates((current) => current.filter((item) => item.id !== templateId));
      setTemplateId(null);
    } catch {
      setTemplateError("Não foi possível excluir o filtro.");
    }
  };

  const removeRecent = async (run: SimulationRun) => {
    if (!window.confirm("Excluir este simulado do histórico?")) return;
    setDeletingRecentId(run.id);
    setError(null);
    try {
      await deleteSimulation(run.id);
      setRecent((current) => current.filter((item) => item.id !== run.id));
    } catch {
      setError("Não foi possível excluir o simulado.");
    } finally {
      setDeletingRecentId(null);
    }
  };

  const resultMap = useMemo(
    () => new Map(results.map((item) => [item.question_id, item])),
    [results],
  );
  const total = questions.length;
  const score = results.filter((item) => item.is_correct).length;
  const blankCount = results.filter((item) => item.selected_answer === null).length;
  const wrongCount = results.filter((item) => !item.is_correct && item.selected_answer !== null).length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const message =
    percentage >= 90
      ? "Excelente! Você está muito bem preparado."
      : percentage >= 70
        ? "Muito bom! Continue nesse ritmo."
        : percentage >= 50
          ? "Você está no caminho certo, mas ainda pode melhorar."
          : "Continue estudando: revise os conteúdos das questões erradas.";
  const byDiscipline = useMemo(() => {
    const map = new Map<string, { correct: number; wrong: number; blank: number }>();
    for (const item of questions) {
      const feedback = resultMap.get(item.id);
      const entry = map.get(item.discipline) ?? { correct: 0, wrong: 0, blank: 0 };
      if (!feedback || feedback.selected_answer === null) entry.blank += 1;
      else if (feedback.is_correct) entry.correct += 1;
      else entry.wrong += 1;
      map.set(item.discipline, entry);
    }
    return [...map.entries()].sort(
      (a, b) => (b[1].wrong + b[1].blank) - (a[1].wrong + a[1].blank),
    );
  }, [questions, resultMap]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-4xl items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </main>
    );
  }

  if (step === "playing" && question) {
    const countdownCritical = secondsLeft != null && secondsLeft <= 60;
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-6">
          <header className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Simulado Digital</h1>
              <div className="flex items-center gap-3">
                {secondsLeft != null ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
                      countdownCritical
                        ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
                    }`}
                  >
                    <Clock size={14} /> {formatClock(secondsLeft)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <Clock size={14} /> Sem limite
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>
          </header>

          <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(19,43,87,0.055)] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg bg-blue-600 px-2.5 py-1.5 font-bold text-white">Questão {index + 1}</span>
                  <span className="rounded-lg bg-slate-200/80 px-2.5 py-1.5 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">ID #{question.id}</span>
                  <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">{question.discipline}</span>
                  <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">Ano {question.year}</span>
                  <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">{question.banca}</span>
                </div>
                {(question.exam_role || question.exam_title || question.exam_institution) && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {[
                      question.exam_role ? `Cargo: ${question.exam_role}` : "",
                      question.exam_title ? `Prova: ${question.exam_title}` : "",
                      question.exam_institution ? `Órgão: ${question.exam_institution}` : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {answers[index] !== undefined && <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Marcada</span>}
              </div>
            </div>
            <div className="px-5 py-6 sm:px-7">
              <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400"><CircleHelp size={15} /> Enunciado</div>
              <QuestionContent text={question.statement} className="font-medium leading-relaxed text-slate-800 dark:text-slate-100 text-[15px] sm:text-base" />
              <div className="mt-7 space-y-2.5" role="radiogroup" aria-label={`Alternativas da questão ${index + 1}`}>
                {question.options.map((option, optionIndex) => {
                  const isSelected = answers[index] === optionIndex;
                  return (
                    <label key={`${question.id}-${optionIndex}`} className={`flex cursor-pointer items-baseline gap-2 rounded-2xl px-4 py-3.5 leading-6 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 text-sm ${isSelected ? "" : "hover:bg-slate-100/70 dark:hover:bg-slate-800/60"}`}>
                      <input type="radio" name={`question-${question.id}`} checked={isSelected} onChange={() => chooseOption(optionIndex)} className="sr-only" />
                      <span className={`inline-flex h-5 shrink-0 items-center justify-center rounded-lg px-3 text-xs font-extrabold leading-none ${isSelected ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{letterFor(optionIndex)}</span>
                      <QuestionContent text={option} className="min-w-0 flex-1 text-slate-700 dark:text-slate-200" />
                    </label>
                  );
                })}
              </div>
            </div>
          </article>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={index === 0}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold transition disabled:opacity-40 dark:border-slate-700"
            >
              <ArrowLeft size={15} /> Anterior
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  deadlineMs.current = null;
                  setSecondsLeft(null);
                  setStep("config");
                }}
                disabled={submitting}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <XCircle size={15} /> Cancelar
              </button>
              {index < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setIndex((current) => Math.min(questions.length - 1, current + 1))}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Próxima <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finish}
                  disabled={submitting}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}
                  Concluir simulado
                </button>
              )}
            </div>
          </footer>
          </div>

          <aside className="w-full shrink-0 lg:max-h-[calc(100vh-3rem)] lg:w-72 lg:self-start lg:sticky lg:top-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                  <Trophy size={15} className="text-amber-500" /> Resumo da prova
                </h2>
                <span className="text-xl font-bold text-blue-600 tabular-nums dark:text-blue-400">
                  {questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0}%
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {answeredCount} de {questions.length} questões respondidas
              </p>
              <div className="mt-3 grid max-h-56 grid-cols-6 gap-1.5 overflow-auto pr-1">
                {questions.map((item, i) => {
                  const isAnswered = answers[i] !== null;
                  const isCurrent = i === index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Ir para questão ${i + 1}`}
                      className={`flex h-7 items-center justify-center rounded-lg text-xs font-semibold transition ${
                        isCurrent
                          ? "bg-blue-600 text-white"
                          : isAnswered
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        {confirmBlank !== null && (
          <div role="dialog" aria-modal="true" aria-label="Enviar simulado" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setConfirmBlank(null)}>
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100"><Trophy size={20} className="text-amber-500" /> Finalizar simulado</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {confirmBlank === 1
                  ? "Você deixou 1 questão em branco."
                  : `Você deixou ${confirmBlank} questões em branco.`}{" "}
                <span className="font-semibold text-red-600 dark:text-red-400">
                  Questões em branco serão contadas como erradas.
                </span>
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmBlank(null)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmBlank(null);
                    void submit();
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}
                  Enviar respostas
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (step === "result" && total > 0) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <div
              className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full text-3xl font-bold ${
                percentage >= 70
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
              }`}
            >
              {percentage}%
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-100">
              Você acertou {score} de {total}
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">{message}</p>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
              <span>{formatClock(timeUsed)} de tempo usado</span>
              {discipline && <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{discipline}</span>}
              {banca && <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{banca}</span>}
              {year && <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{year}</span>}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setStep("config")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <RefreshCw size={15} /> Novo simulado
              </button>
              <Link
                href="/simulations/history"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
              >
                <History size={15} /> Ver histórico
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Desempenho</h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-950/40">
                <CheckCircle2 size={16} className="mx-auto text-emerald-600 dark:text-emerald-400" />
                <p className="mt-1.5 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{score}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">Acertos</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4 text-center dark:bg-red-950/40">
                <XCircle size={16} className="mx-auto text-red-600 dark:text-red-400" />
                <p className="mt-1.5 text-2xl font-bold text-red-700 dark:text-red-400">{wrongCount}</p>
                <p className="text-xs text-red-600 dark:text-red-500">Erros</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-950/40">
                <CircleHelp size={16} className="mx-auto text-slate-500 dark:text-slate-400" />
                <p className="mt-1.5 text-2xl font-bold text-slate-700 dark:text-slate-300">{blankCount}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Em branco</p>
              </div>
            </div>
            <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="flex h-full overflow-hidden rounded-full">
                <div className="h-full bg-emerald-500" style={{ width: `${total > 0 ? (score / total) * 100 : 0}%` }} />
                <div className="h-full bg-red-500" style={{ width: `${total > 0 ? (wrongCount / total) * 100 : 0}%` }} />
                <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: `${total > 0 ? (blankCount / total) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {score} certas</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> {wrongCount} erradas</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" /> {blankCount} em branco</span>
            </div>
            {byDiscipline.length > 1 && (
              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Por disciplina</h3>
                <div className="mt-3 space-y-3">
                  {byDiscipline.map(([name, entry]) => {
                    const count = entry.correct + entry.wrong + entry.blank;
                    const accuracy = count > 0 ? Math.round((entry.correct / count) * 100) : 0;
                    return (
                      <div key={name}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {entry.correct}/{count} certas · {accuracy}%
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div className="flex h-full overflow-hidden rounded-full">
                            <div className="bg-emerald-500" style={{ width: `${count > 0 ? (entry.correct / count) * 100 : 0}%` }} />
                            <div className="bg-red-500" style={{ width: `${count > 0 ? (entry.wrong / count) * 100 : 0}%` }} />
                            <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${count > 0 ? (entry.blank / count) * 100 : 0}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            {questions.map((item) => {
              const feedback = resultMap.get(item.id);
              const isBlank = !feedback || feedback.selected_answer === null;
              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-5 dark:border-slate-800 dark:bg-slate-900 ${
                    isBlank
                      ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                      : feedback!.is_correct
                        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                        : "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {item.discipline}
                    </p>
                    {isBlank ? (
                      <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Em branco
                      </span>
                    ) : feedback!.is_correct ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        <CheckCircle2 size={13} /> Correta
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
                        <XCircle size={13} /> Incorreta
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{item.statement}</p>
                  <div className="mt-4 space-y-2">
                    {item.options.map((option, optionIndex) => {
                      const isCorrectOption = feedback != null && feedback.correct_answer === optionIndex;
                      const isWrongPick = feedback != null && feedback.selected_answer === optionIndex && !feedback.is_correct;
                      return (
                        <p
                          key={optionIndex}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            isCorrectOption
                              ? "bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : isWrongPick
                                ? "bg-red-100 font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300"
                                : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {letterFor(optionIndex)} {option}
                        </p>
                      );
                    })}
                  </div>
                  {feedback && <Explanation text={feedback.explanation} />}
                </article>
              );
            })}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Simulados Digital</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Monte um simulado com questões de provas anteriores e receba a correção na hora.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center dark:bg-slate-950/50">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Filtros salvos
              </span>
              <select
                value={templateId ?? ""}
                onChange={(event) => loadTemplate(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Selecione um modelo salvo</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Salvar filtros atuais
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Nome do filtro"
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => void saveTemplate()}
                  disabled={savingTemplate}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingTemplate ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar
                </button>
                {templateId != null && templates.some((item) => item.id === templateId) && (
                  <button
                    type="button"
                    onClick={() => void removeTemplate()}
                    aria-label="Excluir filtro salvo"
                    className="inline-flex items-center justify-center rounded-lg bg-white px-3 py-2 text-slate-500 ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
          {templateError && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {templateError}
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Disciplina</span>
              <select
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Todas as disciplinas</option>
                {disciplines.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Banca</span>
              <select
                value={banca}
                onChange={(event) => changeBanca(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Todas as bancas</option>
                {bancas.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ano</span>
              <select
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Todos os anos</option>
                {years.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Provas {selectedExams.length > 0 && `(${selectedExams.length} selecionadas)`}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Opcional - se nenhuma prova for escolhida, valem os filtros de disciplina, banca e ano.
              </span>
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 dark:border-slate-700">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  value={examSearch}
                  onChange={(event) => setExamSearch(event.target.value)}
                  placeholder="Buscar prova, cargo ou instituição..."
                  className="h-10 flex-1 bg-transparent text-sm dark:text-slate-100"
                />
              </div>
              <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                {visibleExams.map((exam) => {
                  const checked = selectedExams.includes(exam.id);
                  return (
                    <label
                      key={exam.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExam(exam.id)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                        {exam.title} <span className="text-slate-400">({exam.question_count})</span>
                      </span>
                    </label>
                  );
                })}
                {visibleExams.length === 0 && (
                  <p className="px-2 py-1 text-xs text-slate-400">Nenhuma prova encontrada.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 rounded-xl bg-slate-50 p-4 dark:bg-slate-950/50">
            <label className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Prova completa
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Usar todas as questões da prova selecionada.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={fullExam}
                onClick={() => setFullExam((current) => !current)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                  fullExam ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    fullExam ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
            {fullExam && selectedExams.length !== 1 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Selecione exatamente uma prova para usar todas as suas questões.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Número de questões
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {COUNT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCount(value)}
                    disabled={fullExam}
                    className={`h-10 min-w-12 rounded-lg px-3 text-sm font-semibold transition disabled:opacity-40 ${
                      count === value
                        ? "bg-blue-600 text-white"
                        : "bg-white text-blue-600 ring-1 ring-slate-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                    }`}
                  >
                    {value}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setCount(Number.isFinite(value) && value >= 1 && value <= 100 ? value : 1);
                  }}
                  disabled={fullExam}
                  className="h-10 w-20 rounded-lg border border-slate-300 bg-transparent px-3 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              {fullExam && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Todas as questões da prova selecionada serão usadas.
                </p>
              )}
            </div>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Tempo limite
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTimeLimit(0)}
                  className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${
                    timeLimit === 0
                      ? "bg-blue-600 text-white"
                      : "bg-white text-blue-600 ring-1 ring-slate-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                  }`}
                >
                  Sem limite
                </button>
                {TIME_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTimeLimit(value)}
                    className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${
                      timeLimit === value
                        ? "bg-blue-600 text-white"
                        : "bg-white text-blue-600 ring-1 ring-slate-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                    }`}
                  >
                    {value} min
                  </button>
                ))}
              </div>
            </label>
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <FolderDown size={13} /> O simulado pode respeitar o limite diário de questões do seu plano.
          </p>
          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void start()}
            disabled={starting}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
          >
            {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {starting ? "Montando simulado..." : "Iniciar simulado"}
          </button>
        </section>

        {recent.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <History size={16} className="text-blue-600" /> Últimos resultados
              </h2>
              <Link
                href="/simulations/history"
                className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver todos
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((run) => {
                const canReview = run.status === "finished";
                return (
                  <div
                    key={run.id}
                    className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${
                      canReview ? "" : "opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {run.score} de {run.total} ({run.total > 0 ? Math.round((run.score / run.total) * 100) : 0}%)
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(run.created_at)}</p>
                        <p className="mt-1 flex flex-wrap gap-1 text-[11px]">
                          {run.status === "expired" && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-400">
                              Expirado
                            </span>
                          )}
                          {run.discipline && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {run.discipline}
                            </span>
                          )}
                          {run.banca && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {run.banca}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/simulations/review?run=${run.id}`}
                        aria-disabled={!canReview}
                        className={`inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-white px-3 text-xs font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 ${
                          canReview ? "hover:bg-blue-50 dark:hover:bg-slate-800" : "pointer-events-none opacity-60"
                        }`}
                      >
                        {canReview ? "Revisar" : "Sem correção"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeRecent(run)}
                        disabled={deletingRecentId === run.id}
                        aria-label="Excluir simulado"
                        title="Excluir simulado"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-red-500 ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:bg-slate-900 dark:text-red-400 dark:ring-slate-800 dark:hover:bg-red-950 dark:hover:text-red-500"
                      >
                        {deletingRecentId === run.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}