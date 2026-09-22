"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { ChatMessage, Conversation, createConversation, deleteConversation, listConversations, sendMessage } from "@/lib/chat";
import { Exam, listExams } from "@/lib/exams";
import { listQuestions, Question } from "@/lib/questions";
import { getSubscription } from "@/lib/plans";

export function ChatShell() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [questionIds, setQuestionIds] = useState<number[]>([]);
  const [advancedTools, setAdvancedTools] = useState(false);

  const load = useCallback(async () => {
    const data = await listConversations();
    setConversations(data);
    setActiveId((current) => current ?? data[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
    void Promise.all([listExams(), listQuestions(), getSubscription()]).then(([examItems, questionItems, subscription]) => {
      setExams(examItems.slice(0, 30));
      setQuestions(questionItems.slice(0, 50));
      setAdvancedTools(subscription?.status === "active" && subscription.plan.capabilities.advanced_tools);
    }).catch(() => setError("Não foi possível carregar provas e questões para o contexto."));
  }, [load]);
  const active = conversations.find((item) => item.id === activeId);

  async function startConversation() {
    const created = await createConversation();
    setConversations((current) => [created, ...current]);
    setActiveId(created.id);
  }

  async function removeConversation(id: number) {
    if (!window.confirm("Excluir esta conversa?")) return;
    await deleteConversation(id);
    const next = conversations.filter((item) => item.id !== id);
    setConversations(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  }

  async function submit(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const content = (preset ?? value).trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const created = await createConversation();
        conversationId = created.id;
        setActiveId(created.id);
        setConversations((current) => [created, ...current]);
      }
      const temporary: ChatMessage = { id: -Date.now(), role: "user", content, provider: "", created_at: new Date().toISOString() };
      setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: [...item.messages, temporary] } : item));
      setValue("");
      const result = await sendMessage(conversationId, content, {
        exam_id: examId ?? undefined,
        question_ids: questionIds.length ? questionIds : undefined,
      });
      setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, title: item.messages.length ? item.title : content.slice(0, 120), messages: [...item.messages.filter((message) => message.id !== temporary.id), result.user_message, result.assistant_message] } : item));
    } catch {
      setError("O assistente não conseguiu responder agora. Sua mensagem foi preservada no histórico.");
      await load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <button onClick={() => void startConversation()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"><MessageSquarePlus className="h-4 w-4" /> Nova conversa</button>
        <div className="mt-4 space-y-2">{conversations.map((conversation) => <div key={conversation.id} className={`flex items-center rounded-xl border p-2 ${activeId === conversation.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-slate-200 dark:border-slate-800"}`}><button onClick={() => setActiveId(conversation.id)} className="min-w-0 flex-1 truncate px-2 text-left text-sm">{conversation.title}</button><button onClick={() => void removeConversation(conversation.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>
      </aside>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800"><h1 className="font-semibold">Chat de estudos</h1><p className="text-xs text-slate-500">Conversas persistidas e contexto baseado no seu desempenho</p></header>
        {advancedTools ? <div className="grid gap-2 border-b border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-800">
          <select aria-label="Prova para contexto" value={examId ?? ""} onChange={(event) => setExamId(event.target.value ? Number(event.target.value) : null)} className="h-10 min-w-0 rounded-lg border border-slate-300 bg-transparent px-3 text-xs dark:border-slate-700">
            <option value="">Adicionar uma prova ao contexto</option>
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title} — {exam.year}</option>)}
          </select>
          <select aria-label="Questão para contexto" value="" onChange={(event) => { const id = Number(event.target.value); if (id) setQuestionIds((current) => current.includes(id) || current.length >= 5 ? current : [...current, id]); }} className="h-10 min-w-0 rounded-lg border border-slate-300 bg-transparent px-3 text-xs dark:border-slate-700">
            <option value="">Adicionar questões ao contexto (máx. 5)</option>
            {questions.map((question) => <option key={question.id} value={question.id}>#{question.id} — {question.discipline}: {question.statement.slice(0, 55)}</option>)}
          </select>
          {questionIds.length > 0 && <div className="flex flex-wrap gap-1 sm:col-span-2">{questionIds.map((id) => <button key={id} onClick={() => setQuestionIds((current) => current.filter((item) => item !== id))} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] dark:bg-slate-800">Questão #{id} ×</button>)}</div>}
        </div> : <p className="border-b border-slate-200 px-5 py-2 text-xs text-slate-500 dark:border-slate-800">No plano Avançado, você pode anexar provas e questões reais ao contexto.</p>}
        <div className="h-[500px] space-y-4 overflow-y-auto p-5">
          {!active?.messages.length && <div className="mx-auto max-w-lg py-16 text-center text-slate-500"><p>Como posso ajudar nos seus estudos?</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => void submit(undefined, "Gere um resumo das minhas estatísticas.")} className="rounded-lg border px-3 py-2 text-xs">Resumo das estatísticas</button><button onClick={() => void submit(undefined, "Monte um plano de estudos para 7 dias.")} className="rounded-lg border px-3 py-2 text-xs">Plano de 7 dias</button></div></div>}
          {active?.messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800"}`}>{message.content}{message.provider === "local" && <div className="mt-2 text-[10px] opacity-60">Assistência local</div>}</div></div>)}
          {sending && <p className="text-sm text-slate-400">Preparando resposta…</p>}
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>
        <form onSubmit={(event) => void submit(event)} className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><input value={value} onChange={(event) => setValue(event.target.value)} maxLength={8000} placeholder="Digite sua mensagem" className="h-11 flex-1 rounded-xl border border-slate-300 bg-transparent px-4 text-sm dark:border-slate-700" /><button disabled={sending || !value.trim()} className="rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50">Enviar</button></form>
      </section>
    </div>
  );
}
