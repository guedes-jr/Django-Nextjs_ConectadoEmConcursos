"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import type { Question } from "@/lib/questions";
import { listQuestions } from "@/lib/questions";
import { getQuestionDetails } from "@/lib/simulations";
import {
  addNotebookQuestion,
  createNotebook,
  deleteNotebook,
  listNotebooks,
  removeNotebookQuestion,
  renameNotebook,
  type Notebook,
} from "@/lib/workspace";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function snippet(text: string, max = 140) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default function NotebooksPage() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Record<number, Question>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotebooks(await listNotebooks());
    } catch {
      setError("Não foi possível carregar os cadernos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!createTitle.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const item = await createNotebook(createTitle.trim());
      setNotebooks((current) => [item, ...current]);
      setCreateTitle("");
    } catch {
      setError("Não foi possível criar o caderno.");
    } finally {
      setCreating(false);
    }
  };

  const expand = async (notebookId: number) => {
    if (expandedId === notebookId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(notebookId);
    setLoadingQuestions(true);
    try {
      const notebook = notebooks.find((item) => item.id === notebookId);
      if (notebook && notebook.question_ids.length > 0) {
        const details = await Promise.all(notebook.question_ids.map((id) => getQuestionDetails(id)));
        setQuestions((current) => {
          const next = { ...current };
          for (const item of details) next[item.id] = item;
          return next;
        });
      }
    } catch {
      // ignora falha ao carregar enunciados
    } finally {
      setLoadingQuestions(false);
    }
  };

  const removeQuestion = async (notebookId: number, questionId: number) => {
    try {
      const updated = await removeNotebookQuestion(notebookId, questionId);
      setNotebooks((current) => current.map((item) => (item.id === notebookId ? updated : item)));
    } catch {
      setError("Não foi possível remover a questão.");
    }
  };

  const removeNotebook = async (notebookId: number) => {
    if (!window.confirm("Excluir este caderno? As questões permanecem no banco de questões.")) return;
    try {
      await deleteNotebook(notebookId);
      setNotebooks((current) => current.filter((item) => item.id !== notebookId));
      if (expandedId === notebookId) setExpandedId(null);
    } catch {
      setError("Não foi possível excluir o caderno.");
    }
  };

  const saveRename = async (notebookId: number) => {
    if (!editTitle.trim()) return;
    try {
      const updated = await renameNotebook(notebookId, editTitle.trim());
      setNotebooks((current) => current.map((item) => (item.id === notebookId ? updated : item)));
      setEditingId(null);
    } catch {
      setError("Não foi possível renomear o caderno.");
    }
  };

  const runSearch = useCallback(async () => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await listQuestions({ search: search.trim(), page_size: 8 });
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void runSearch(), 300);
    return () => window.clearTimeout(timer);
  }, [runSearch]);

  const expanded = notebooks.find((item) => item.id === expandedId);
  const expandedQuestionIds = expanded?.question_ids ?? [];

  const addQuestion = async (questionId: number) => {
    if (!expandedId) return;
    try {
      const updated = await addNotebookQuestion(expandedId, questionId);
      setNotebooks((current) => current.map((item) => (item.id === expandedId ? updated : item)));
      const detail = await getQuestionDetails(questionId);
      setQuestions((current) => ({ ...current, [questionId]: detail }));
      setResults((current) => current.filter((item) => item.id !== questionId));
      setSearch("");
    } catch {
      setError("Não foi possível adicionar a questão ao caderno.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-5xl items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cadernos de Questões</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Organize questões por assunto ou banca em cadernos personalizados.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label className="relative flex-1">
              <span className="sr-only">Título do caderno</span>
              <BookOpen className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Nome do novo caderno, ex.: Direito Constitucional"
                maxLength={120}
                className="h-10 w-full rounded-lg border border-slate-300 bg-transparent pl-9 pr-3 text-sm dark:border-slate-700 dark:text-slate-100"
              />
            </label>
            <button
              type="submit"
              disabled={!createTitle.trim() || creating}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Criar caderno
            </button>
          </form>
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {notebooks.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <BookOpen className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">Nenhum caderno ainda</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Crie um caderno para agrupar questões que você quer revisar depois.
            </p>
            <Link
              href="/questions"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Ir para questões
            </Link>
          </section>
        ) : (
          <div className="space-y-4">
            {notebooks.map((notebook) => {
              const isExpanded = expandedId === notebook.id;
              return (
                <section
                  key={notebook.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <button type="button" onClick={() => void expand(notebook.id)} className="flex flex-1 items-center gap-3 text-left">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <div className="min-w-0">
                        {editingId === notebook.id ? (
                          <input
                            value={editTitle}
                            autoFocus
                            onChange={(event) => setEditTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void saveRename(notebook.id);
                              if (event.key === "Escape") setEditingId(null);
                            }}
                            className="w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm font-bold dark:border-slate-700 dark:text-slate-100"
                          />
                        ) : (
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{notebook.title}</p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {notebook.question_ids.length} questão{notebook.question_ids.length === 1 ? "" : "ões"} · criado em{" "}
                          {formatDate(notebook.created_at)}
                        </p>
                      </div>
                    </button>
                    {editingId === notebook.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void saveRename(notebook.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(notebook.id);
                            setEditTitle(notebook.title);
                          }}
                          aria-label="Renomear caderno"
                          className="rounded-lg bg-white p-2 text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeNotebook(notebook.id)}
                          aria-label="Excluir caderno"
                          className="rounded-lg bg-white p-2 text-red-500 ring-1 ring-slate-200 transition hover:bg-red-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:bg-red-950/40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar questão pelo enunciado para adicionar ao caderno"
                            className="h-10 w-full rounded-lg border border-slate-300 bg-transparent pl-9 pr-9 text-sm dark:border-slate-700 dark:text-slate-100"
                          />
                          {search && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearch("");
                                setResults([]);
                              }}
                              aria-label="Limpar busca"
                              className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        {searching && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                            <Loader2 size={12} className="animate-spin" /> Buscando...
                          </p>
                        )}
                        {!searching && results.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {results.map((item) => (
                              <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                                <p className="text-xs text-slate-700 dark:text-slate-200">{snippet(item.statement)}</p>
                                <button
                                  type="button"
                                  onClick={() => void addQuestion(item.id)}
                                  className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                                >
                                  Adicionar
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {loadingQuestions && (
                        <p className="flex items-center justify-center gap-1.5 py-4 text-sm text-slate-400">
                          <Loader2 size={15} className="animate-spin" /> Carregando questões...
                        </p>
                      )}

                      {!loadingQuestions && expandedQuestionIds.length === 0 && (
                        <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                          Nenhuma questão neste caderno ainda. Use a busca acima para adicionar.
                        </p>
                      )}

                      {!loadingQuestions && expandedQuestionIds.length > 0 && (
                        <ul className="space-y-2">
                          {expandedQuestionIds.map((questionId) => {
                            const item = questions[questionId];
                            return (
                              <li
                                key={questionId}
                                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                    {item?.discipline ?? "Questão"}
                                  </p>
                                  {item ? (
                                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{snippet(item.statement)}</p>
                                  ) : (
                                    <p className="mt-1 text-sm text-slate-400">Carregando enunciado...</p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void removeQuestion(notebook.id, questionId)}
                                  aria-label="Remover questão"
                                  className="shrink-0 rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
