"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bookmark, MessageSquare, Search, StickyNote } from "lucide-react";

import {
  AnswerResult,
  Question,
  QuestionComment,
  answerQuestion,
  createComment,
  deleteComment,
  getNote,
  listComments,
  listQuestions,
  reportQuestion,
  saveNote,
  toggleFavorite,
} from "@/lib/questions";


type OpenPanel = "note" | "comments" | "report" | null;

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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [examId, setExamId] = useState<number | undefined>();
  const [queryReady, setQueryReady] = useState(false);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [results, setResults] = useState<Record<number, AnswerResult>>({});
  const [openPanels, setOpenPanels] = useState<Record<number, OpenPanel>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, QuestionComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<number, string>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});

  const loadQuestions = useCallback(async () => {
    if (!queryReady) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listQuestions({
        search: search || undefined,
        discipline: discipline || undefined,
        favorites: favoritesOnly || undefined,
        exam: examId,
      });
      setQuestions(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [discipline, examId, favoritesOnly, queryReady, search]);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("exam");
    setExamId(value && /^\d+$/.test(value) ? Number(value) : undefined);
    setQueryReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQuestions(), 250);
    return () => window.clearTimeout(timer);
  }, [loadQuestions]);

  async function submitAnswer(question: Question) {
    const answer = selected[question.id];
    if (answer === undefined) return;
    try {
      const result = await answerQuestion(question.id, answer);
      setResults((current) => ({ ...current, [question.id]: result }));
    } catch (requestError) {
      setMessages((current) => ({ ...current, [question.id]: getErrorMessage(requestError) }));
    }
  }

  async function favorite(question: Question) {
    const result = await toggleFavorite(question.id);
    setQuestions((current) =>
      favoritesOnly && !result.is_favorite
        ? current.filter((item) => item.id !== question.id)
        : current.map((item) =>
            item.id === question.id ? { ...item, is_favorite: result.is_favorite } : item
          )
    );
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

  const disciplines = [...new Set(questions.map((question) => question.discipline))].sort();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{examId ? "Questões da prova" : "Questões de concursos"}</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">Responda, acompanhe tentativas e organize seus estudos.</p>
        </header>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[1fr_220px_auto]">
          <label className="relative">
            <span className="sr-only">Pesquisar questões</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar enunciado" className="h-10 w-full rounded-lg border border-slate-300 bg-transparent pl-9 pr-3 text-sm dark:border-slate-700" />
          </label>
          <select value={discipline} onChange={(event) => setDiscipline(event.target.value)} aria-label="Disciplina" className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700">
            <option value="">Todas as disciplinas</option>
            {disciplines.map((item) => <option key={item}>{item}</option>)}
          </select>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700">
            <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /> Favoritas
          </label>
        </section>

        {loading && <p className="text-slate-500">Carregando questões…</p>}
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}

        <section className="space-y-5">
          {questions.map((question, index) => {
            const result = results[question.id];
            const panel = openPanels[question.id];
            return (
              <article key={question.id} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-xs font-medium text-slate-500">Questão {index + 1} · {question.discipline} · {question.banca} {question.year}</div>
                  <button onClick={() => void favorite(question)} aria-label="Favoritar" className={question.is_favorite ? "text-amber-500" : "text-slate-400"}><Bookmark className="h-5 w-5" fill={question.is_favorite ? "currentColor" : "none"} /></button>
                </div>
                <p className="mt-4 font-medium text-slate-900 dark:text-slate-100">{question.statement}</p>
                <div className="mt-4 space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const isCorrect = result?.correct_answer === optionIndex;
                    const isWrong = result && result.selected_answer === optionIndex && !result.is_correct;
                    return (
                      <label key={`${question.id}-${optionIndex}`} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950" : isWrong ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-slate-200 dark:border-slate-700"}`}>
                        <input type="radio" name={`question-${question.id}`} checked={selected[question.id] === optionIndex} disabled={Boolean(result)} onChange={() => setSelected((current) => ({ ...current, [question.id]: optionIndex }))} />
                        <span>{String.fromCharCode(65 + optionIndex)}. {option}</span>
                      </label>
                    );
                  })}
                </div>
                {!result ? (
                  <button onClick={() => void submitAnswer(question)} disabled={selected[question.id] === undefined} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Responder</button>
                ) : (
                  <div className={`mt-4 rounded-lg p-4 text-sm ${result.is_correct ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>
                    <strong>{result.is_correct ? "Resposta correta." : "Resposta incorreta."}</strong>
                    {result.explanation && <p className="mt-1">{result.explanation}</p>}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <button onClick={() => void openPanel(question.id, panel === "note" ? null : "note")} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><StickyNote className="h-4 w-4" /> Anotação</button>
                  <button onClick={() => void openPanel(question.id, panel === "comments" ? null : "comments")} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><MessageSquare className="h-4 w-4" /> Comentários ({comments[question.id]?.length ?? question.comment_count})</button>
                  <button onClick={() => void openPanel(question.id, panel === "report" ? null : "report")} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><AlertTriangle className="h-4 w-4" /> Informar erro</button>
                </div>

                {panel === "note" && <div className="mt-4"><textarea value={notes[question.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Sua anotação privada" className="min-h-24 w-full rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700" /><button onClick={async () => { await saveNote(question.id, notes[question.id] ?? ""); setMessages((current) => ({ ...current, [question.id]: "Anotação salva." })); }} className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">Salvar anotação</button></div>}

                {panel === "comments" && <div className="mt-4 space-y-3">{(comments[question.id] ?? []).map((comment) => <div key={comment.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><div className="flex justify-between"><strong>{comment.author}</strong>{comment.is_owner && <button onClick={() => void removeComment(question.id, comment.id)} className="text-xs text-red-600">Excluir</button>}</div><p className="mt-1">{comment.content}</p></div>)}<form onSubmit={(event) => void submitComment(event, question.id)} className="flex gap-2"><input value={commentDrafts[question.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Adicionar comentário" className="h-10 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700" /><button className="rounded-lg bg-blue-600 px-4 text-sm text-white">Enviar</button></form></div>}

                {panel === "report" && <form onSubmit={(event) => void submitReport(event, question.id)} className="mt-4"><textarea value={reportDrafts[question.id] ?? ""} onChange={(event) => setReportDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Descreva o problema encontrado (mínimo de 10 caracteres)" className="min-h-24 w-full rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700" /><button className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white">Enviar relatório</button></form>}
                {messages[question.id] && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{messages[question.id]}</p>}
              </article>
            );
          })}
          {!loading && !error && questions.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">Nenhuma questão encontrada.</p>}
        </section>
      </div>
    </main>
  );
}
