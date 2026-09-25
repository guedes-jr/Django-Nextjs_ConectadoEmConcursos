"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import {
  createFlashcard,
  deleteFlashcard,
  listFlashcards,
  reviewFlashcard,
  type Flashcard,
} from "@/lib/workspace";

type Feedback = { kind: "success" | "error"; message: string };

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatInterval(days: number) {
  return days === 1 ? "1 dia" : `${days} dias`;
}

export default function FlashcardsPage() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [creating, setCreating] = useState(false);

  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Flashcard | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((kind: Feedback["kind"], message: string) => {
    setFeedback({ kind, message });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await listFlashcards());
    } catch {
      setLoadError(true);
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
      notify("success", "Cartão criado com sucesso.");
    } catch {
      notify("error", "Não foi possível criar o cartão. Preencha frente e verso.");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteFlashcard(deleteTarget.id);
      setCards((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify("success", "Cartão excluído.");
    } catch {
      notify("error", "Não foi possível excluir o cartão.");
    } finally {
      setDeleting(false);
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
      notify(
        "success",
        correct
          ? `Acertou! Próxima revisão em ${formatInterval(updated.interval_days)}.`
          : "Não lembrou — o cartão voltará mais cedo para revisão.",
      );
    } catch {
      notify("error", "Não foi possível registrar a revisão.");
    }
  };

  const flip = (id: number) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

        {loadError ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            Não foi possível carregar os flashcards.
          </p>
        ) : cards.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <Layers className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">Nenhum cartão ainda</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Crie seu primeiro flashcard para memorizar fórmulas, prazos e definições.
            </p>
          </section>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {cards.map((card) => {
              const isRevealed = revealed.has(card.id);
              return (
                <div key={card.id} className="flex [perspective:1200px]">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={isRevealed}
                    aria-label={isRevealed ? "Mostrar o verso do cartão" : "Revelar a resposta do cartão"}
                    onClick={() => flip(card.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        flip(card.id);
                      }
                    }}
                    className={`relative flex h-72 w-full cursor-pointer flex-col rounded-2xl transition-transform duration-500 [transform-style:preserve-3d] ${
                      isRevealed ? "[transform:rotateY(180deg)]" : ""
                    }`}
                  >
                    <div className="absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(19,43,87,0.06)] [backface-visibility:hidden] dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-2">
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
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(card);
                          }}
                          aria-label="Excluir cartão"
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden py-4">
                        <p className="max-h-full max-w-full break-words text-center text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
                          {card.front}
                        </p>
                      </div>
                      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                        <RotateCcw size={12} /> Toque para revelar a resposta
                      </p>
                    </div>

                    <div className="absolute inset-0 flex flex-col rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-[0_14px_40px_rgba(6,78,59,0.12)] [backface-visibility:hidden] [transform:rotateY(180deg)] dark:border-emerald-900/60 dark:from-emerald-950/40 dark:to-slate-900">
                      <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                        Resposta
                      </p>
                      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden py-3">
                        <p className="max-h-full max-w-full whitespace-pre-wrap break-words text-center text-base font-medium leading-relaxed text-slate-800 dark:text-slate-100">
                          {card.back}
                        </p>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void review(card.id, false);
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-100 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-200 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          <X size={13} /> Não lembrava
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void review(card.id, true);
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                        >
                          <Check size={13} /> Acertou
                        </button>
                      </div>
                      {card.next_review_at && (
                        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                          <CalendarDays size={12} /> Próxima revisão: {formatDate(card.next_review_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div
            className={`pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-2xl border bg-white/95 px-5 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur dark:bg-slate-900/95 ${
              feedback.kind === "error"
                ? "border-red-200 text-red-700 dark:border-red-900 dark:text-red-400"
                : "border-emerald-200 text-emerald-800 dark:border-emerald-900 dark:text-emerald-300"
            }`}
          >
            {feedback.kind === "error" ? (
              <XCircle size={17} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
            )}
            {feedback.message}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Excluir cartão"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                <Trash2 size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Excluir cartão</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Deseja excluir o flashcard <span className="font-semibold text-slate-800 dark:text-slate-100">“{deleteTarget.front.slice(0, 60)}”</span>?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}