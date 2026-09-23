"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Reply, Trash2 } from "lucide-react";

import {
  createCommunityPost,
  deleteCommunityPost,
  listCommunity,
  type CommunityPost,
} from "@/lib/workspace";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "U";
}

export default function PostList({
  kind,
  refreshTick = 0,
}: {
  kind: "forum" | "feed";
  refreshTick?: number;
}) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null     );
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replies, setReplies] = useState<Record<number, CommunityPost[]>>({});
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPosts(await listCommunity(kind));
    } catch {
      setError("Não foi possível carregar as publicações.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const toggle = async (post: CommunityPost) => {
    if (expandedId === post.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(post.id);
    if (replies[post.id]) return;
    setLoadingReplies(true);
    try {
      const loaded = await listCommunity(kind, post.id);
      setReplies((current) => ({ ...current, [post.id]: loaded }));
    } catch {
      setReplies((current) => ({ ...current, [post.id]: [] }));
    } finally {
      setLoadingReplies(false);
    }
  };

  const del = async (postId: number) => {
    if (!window.confirm("Excluir esta publicação?")) return;
    try {
      await deleteCommunityPost(postId);
      setPosts((current) => current.filter((item) => item.id !== postId));
      setReplies((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      if (expandedId === postId) setExpandedId(null);
    } catch {
      setError("Não foi possível excluir a publicação.");
    }
  };

  const submitReply = async (post: CommunityPost) => {
    if (!replyDraft.trim() || !replyingTo) return;
    try {
      await createCommunityPost({ kind, content: replyDraft.trim(), parent_id: post.id });
      setReplyDraft("");
      setReplyingTo(null);
      const loaded = await listCommunity(kind, post.id);
      setReplies((current) => ({ ...current, [post.id]: loaded }));
    } catch {
      setError("Não foi possível enviar a resposta.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <section>
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <MessageSquare className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Nenhuma publicação por aqui ainda. Seja a primeira pessoa a contribuir!
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <header className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  {initial(post.author)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{post.author}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(post.created_at)}</p>
                </div>
                {post.is_owner && (
                  <button
                    type="button"
                    onClick={() => void del(post.id)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    aria-label="Excluir publicação"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </header>

              {post.title && (
                <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">{post.title}</h3>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{post.content}</p>

              <footer className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void toggle(post)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {expandedId === post.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {post.replies} resposta{post.replies === 1 ? "" : "s"}
                </button>
              </footer>

              {expandedId === post.id && (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  {loadingReplies ? (
                    <p className="flex items-center gap-2 py-2 text-xs text-slate-400">
                      <Loader2 size={13} className="animate-spin" /> Carregando respostas...
                    </p>
                  ) : replies[post.id]?.length ? (
                    replies[post.id].map((item) => (
                      <div key={item.id} className="flex items-start gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {initial(item.author)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {item.author}
                            <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">
                              {formatDate(item.created_at)}
                            </span>
                          </p>
                          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{item.content}</p>
                        </div>
                        {item.is_owner && (
                          <button
                            type="button"
                            onClick={() => void del(item.id)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            aria-label="Excluir resposta"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-center text-xs text-slate-400">Sem respostas ainda.</p>
                  )}

                  <form
                    className="flex gap-2 pt-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitReply(post);
                    }}
                  >
                    <input
                      value={replyingTo === post.id ? replyDraft : ""}
                      onChange={(event) => {
                        setReplyingTo(post.id);
                        setReplyDraft(event.target.value);
                      }}
                      placeholder="Escreva uma resposta..."
                      maxLength={1000}
                      className="h-10 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={!replyDraft.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Reply size={14} /> Responder
                    </button>
                  </form>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
