"use client";

import { useState } from "react";
import { Loader2, MessageSquare, Plus } from "lucide-react";

import PostList from "@/components/community/PostList";
import { createCommunityPost } from "@/lib/workspace";

export default function ForumPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const create = async () => {
    if (!title.trim() || !content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createCommunityPost({ kind: "forum", title: title.trim(), content: content.trim() });
      setTitle("");
      setContent("");
      setRefreshTick((current) => current + 1);
    } catch {
      setError("Não foi possível publicar o tópico.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <MessageSquare className="text-blue-600" /> Fórum
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Tire dúvidas, compartilhe materiais e discuta temas de concursos com a comunidade.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título do tópico"
              maxLength={160}
              className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:text-slate-100"
            />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Descreva sua dúvida ou o que quer discutir..."
              maxLength={5000}
              rows={3}
              className="rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700 dark:text-slate-100"
            />
            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}
            <div>
              <button
                type="submit"
                disabled={!title.trim() || !content.trim() || submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Publicar tópico
              </button>
            </div>
          </form>
        </section>

        <PostList kind="forum" refreshTick={refreshTick} />
      </div>
    </main>
  );
}