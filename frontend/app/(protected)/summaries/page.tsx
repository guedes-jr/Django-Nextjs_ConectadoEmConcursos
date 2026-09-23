"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Loader2, Sparkles } from "lucide-react";

import { listConversations, createConversation, sendMessage, type Conversation } from "@/lib/chat";
import { listQuestionDisciplines, listQuestions } from "@/lib/questions";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SummariesPage() {
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [discipline, setDiscipline] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [latest, setLatest] = useState<{ title: string; discipline: string; content: string; created_at: string } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, convs] = await Promise.all([listQuestionDisciplines(), listConversations()]);
      setDisciplines(list);
      setConversations(convs);
    } catch {
      // mantém estado inicial
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recent = conversations
    .filter((item) => item.title.toLowerCase().trim().startsWith("resumo de"))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 12);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await listQuestions({
        page_size: 50,
        discipline: discipline || undefined,
      });
      const ids = data.results.map((item) => item.id);
      if (ids.length === 0) {
        setError("Nenhuma questão encontrada para essa disciplina.");
        return;
      }
      const label = discipline || "todas as disciplinas";
      const content = `Resumo de ${label} (${ids.length} questões): sintetize os principais conceitos, definições e pontos de revisão cobrados, organizando por tópicos.`;
      const conversation = await createConversation();
      const { assistant_message } = await sendMessage(conversation.id, content, { question_ids: ids });
      setLatest({
        title: conversation.title,
        discipline: label,
        content: assistant_message.content,
        created_at: assistant_message.created_at,
      });
      setConversations(await listConversations());
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(
        detail ??
          "Não foi possível gerar o resumo. Verifique o limite de mensagens do seu plano e tente novamente.",
      );
    } finally {
      setGenerating(false);
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Resumos</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Gere um resumo de estudo a partir das questões cadastradas em uma disciplina.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
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
          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? "Gerando resumo..." : "Gerar resumo"}
          </button>
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            O resumo usa o plano de IA da sua conta (disponível com ferramentas avançadas) e conta no limite diário de
            mensagens.
          </p>
        </section>

        {latest && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <FileText size={16} className="text-emerald-600 dark:text-emerald-400" />
                Resumo de {latest.discipline}
              </h2>
              <span className="text-xs text-slate-400">{formatDate(latest.created_at)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{latest.content}</p>
            <Link
              href="/chatIA"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Continuar conversa no Chat IA
            </Link>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">Resumos gerados</h2>
            <div className="space-y-2">
              {recent.map((conversation) => {
                const isExpanded = expandedId === conversation.id;
                return (
                  <article
                    key={conversation.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : conversation.id)}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {conversation.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(conversation.created_at)} · {conversation.messages.length} mensagens
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
                        {conversation.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-xl px-4 py-3 text-sm ${
                              message.role === "user"
                                ? "bg-blue-50 text-slate-700 dark:bg-blue-950/40 dark:text-slate-200"
                                : "bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
