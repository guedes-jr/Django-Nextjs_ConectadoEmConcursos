"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Layers, Loader2, Plus, Trash2, X } from "lucide-react";

import {
  createFlashcard,
  deleteFlashcard,
  listFlashcards,
  reviewFlashcard,
  type Flashcard,
} from "@/lib/workspace";

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function FlashcardsPage() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [creating, setCreating] = useState(false);

  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await listFlashcards());
    } catch {
      setError("Não foi possível carregar os flashcards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!front.trim() || !back.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const item = await createFlashcard({
        front: front.trim(),
        back: back.trim(),
        discipline: discipline.trim(),
      });
      setCards((current) => [item, ...current]);
      setFront("");
      setBack("");
      setDiscipline("");
    } catch {
      setError("Não foi possível criar o cartão. Preencha frente e verso.");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Excluir este cartão?")) return;
    try {
      await deleteFlashcard(id);
      setCards((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Não foi possível excluir o cartão.");
    }
  };

  const review = async (id: number, correct: boolean) => {
    try {
      const updated = await reviewFlashcard(id, correct);
      setCards((current) => current.map((item) => (item.id === id ? updated : item)));
      setRevealed((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch {
      setError("Não foi possível registrar a revisão.");
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Meus Flashcards</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Revise conceitos-chave com repetição espaçada: cada acerto aumenta o intervalo antes da próxima revisão.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Frente (pergunta)</span>
                <input
                  value={front}
                  onChange={(event) => setFront(event.target.value)}
                  maxLength={500}
                  placeholder="Ex.: Qual a pena para crime de prevaricação?"
                  className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Verso (resposta)</span>
                <input
                  value={back}
                  onChange={(event) => setBack(event.target.value)}
                  maxLength={5000}
                  placeholder="Ex.: Detenção de 3 meses a 1 ano e multa"
                  className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:text-slate-100"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Disciplina (opcional)</span>
              <input
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
                maxLength={100}
                placeholder="Ex.: Direito Penal"
                className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:text-slate-100"
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={!front.trim() || !back.trim() || creating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Criar cartão
              </button>
            </div>
          </form>
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {cards.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <Layers className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">Nenhum cartão ainda</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Crie seu primeiro flashcard para memorizar fórmulas, prazos e definições.
            </p>
          </section>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((card) => {
              const isRevealed = revealed.has(card.id);
              return (
                <article
                  key={card.id}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {card.discipline && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                          {card.discipline}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {card.interval_days}d
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(card.id)}
                      aria-label="Excluir cartão"
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {card.front}
                  </p>

                  {isRevealed ? (
                    <>
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                        <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{card.back}</p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void review(card.id, false)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-100 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-200 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          <X size={13} /> Não lembrava
                        </button>
                        <button
                          type="button"
                          onClick={() => void review(card.id, true)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                        >
                          <Check size={13} /> Acertou
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRevealed((current) => new Set(current).add(card.id))}
                      className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                    >
                      Mostrar resposta
                    </button>
                  )}

                  {card.next_review_at && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                      <CalendarDays size={12} /> Próxima revisão: {formatDate(card.next_review_at)}
                    </p>
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
