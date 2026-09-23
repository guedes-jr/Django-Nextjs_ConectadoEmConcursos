"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, Check, Loader2, Pencil, Save, Trash2, X } from "lucide-react";

import { saveNote } from "@/lib/questions";
import { listNotes, type Note } from "@/lib/workspace";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function excerpt(text: string, max = 220) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await listNotes());
    } catch {
      setError("Não foi possível carregar suas anotações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (note: Note) => {
    const content = (drafts[note.question_id] ?? note.content).trim();
    setSaving((current) => ({ ...current, [note.question_id]: true }));
    setError(null);
    try {
      const saved = await saveNote(note.question_id, content);
      setNotes((current) =>
        current.map((item) => (item.question_id === note.question_id ? { ...item, content: saved, updated_at: new Date().toISOString() } : item)),
      );
      setEditingId(null);
    } catch {
      setError("Não foi possível salvar a anotação.");
    } finally {
      setSaving((current) => ({ ...current, [note.question_id]: false }));
    }
  };

  const remove = async (note: Note) => {
    if (!window.confirm("Excluir esta anotação?")) return;
    setSaving((current) => ({ ...current, [note.question_id]: true }));
    try {
      await saveNote(note.question_id, "");
      setNotes((current) => current.filter((item) => item.question_id !== note.question_id));
      setEditingId(null);
    } catch {
      setError("Não foi possível excluir a anotação.");
    } finally {
      setSaving((current) => ({ ...current, [note.question_id]: false }));
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto flex max-w-4xl items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Minhas Anotações</h1>
          <p className="text-slate-500 dark:text-slate-400">
            As anotações salvas em cada questão ficam reunidas aqui para revisão.
          </p>
        </header>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {notes.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <Bookmark className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">Nenhuma anotação ainda</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Ao resolver questões, use a opção de anotar para guardar resumos e dicas de cada assunto.
            </p>
            <Link
              href="/questions"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Ir para questões
            </Link>
          </section>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const isEditing = editingId === note.question_id;
              const draft = drafts[note.question_id] ?? note.content;
              const isSaving = saving[note.question_id] ?? false;
              return (
                <article
                  key={note.question_id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      {note.discipline}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Atualizada em {formatDate(note.updated_at)}
                    </p>
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        value={draft}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [note.question_id]: event.target.value }))
                        }
                        rows={6}
                        className="mt-3 w-full rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700 dark:text-slate-100"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void save(note)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setDrafts((current) => {
                              const next = { ...current };
                              delete next[note.question_id];
                              return next;
                            });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-bold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
                        >
                          <X size={13} /> Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                        {excerpt(note.content)}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(note.question_id);
                            setDrafts((current) => ({ ...current, [note.question_id]: note.content }));
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                        >
                          <Pencil size={13} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(note)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-500 ring-1 ring-slate-200 transition hover:bg-red-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:bg-red-950/40 disabled:opacity-60"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                        <Link
                          href="/questions"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800"
                        >
                          <Check size={13} /> Ver questão
                        </Link>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
