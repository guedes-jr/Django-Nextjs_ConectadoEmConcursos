"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, AlertTriangle, Check, Eye, EyeOff, Trash2, PenLine } from "lucide-react";
import {
  backoffice,
  ProofRow,
  NewsAdminRow,
  QuestionAdminRow,
  CommunityPostRow,
  ConcursoRow,
  formatDate,
  statusColor,
  statusLabel,
} from "@/lib/backoffice";

type TabKey = "proofs" | "news" | "questions" | "community" | "concursos";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "proofs", label: "Provas enviadas" },
  { key: "news", label: "Notícias" },
  { key: "questions", label: "Questões sem comentário" },
  { key: "community", label: "Moderação" },
  { key: "concursos", label: "Concursos" },
];

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

export default function AdminContentPage() {
  const [tab, setTab] = useState<TabKey>("proofs");
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [news, setNews] = useState<NewsAdminRow[]>([]);
  const [questions, setQuestions] = useState<QuestionAdminRow[]>([]);
  const [community, setCommunity] = useState<CommunityPostRow[]>([]);
  const [concursos, setConcursos] = useState<ConcursoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const [concursSearch, setConcursSearch] = useState("");
  const [explaining, setExplaining] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const loadTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "proofs") setProofs((await backoffice.listProofs()).results);
      else if (tab === "news") setNews((await backoffice.listNews()).results);
      else if (tab === "questions") setQuestions((await backoffice.listQuestions({ onlyUncommented: true, search: questionSearch })).results);
      else if (tab === "community") setCommunity((await backoffice.listCommunity()).results);
      else if (tab === "concursos") setConcursos((await backoffice.listConcursos({ search: concursSearch })).results);
    } catch {
      setError("Não foi possível carregar esta seção.");
    } finally {
      setLoading(false);
    }
  }, [tab, questionSearch, concursSearch]);

  useEffect(() => {
    const timer = setTimeout(() => void loadTab(), questionSearch || concursSearch ? 300 : 0);
    return () => clearTimeout(timer);
  }, [tab, questionSearch, concursSearch, loadTab]);

  const flash = (message: string, isError = false) => {
    setNotice(isError ? null : message);
    setError(isError ? message : null);
  };

  const setProofStatus = async (proof: ProofRow) => {
    const next = proof.status === "reviewed" ? "pending" : "reviewed";
    try {
      await backoffice.setProofStatus(proof.id, next);
      flash(`Prova marcada como ${next === "reviewed" ? "revisada" : "pendente"}.`);
      void loadTab();
    } catch {
      flash("Falha ao atualizar a prova.", true);
    }
  };

  const setNewsPublished = async (item: NewsAdminRow) => {
    try {
      await backoffice.setNewsPublished(item.id, !item.is_published);
      flash(item.is_published ? "Notícia despublicada." : "Notícia publicada.");
      void loadTab();
    } catch {
      flash("Falha ao atualizar a notícia.", true);
    }
  };

  const saveExplanation = async (question: QuestionAdminRow) => {
    const text = drafts[question.id]?.trim();
    if (!text) return;
    try {
      await backoffice.updateQuestion(question.id, { explanation: text });
      setDrafts((d) => ({ ...d, [question.id]: "" }));
      setExplaining(null);
      flash("Comentário salvo.");
      void loadTab();
    } catch {
      flash("Falha ao salvar o comentário.", true);
    }
  };

  const deletePost = async (post: CommunityPostRow) => {
    if (!window.confirm(`Excluir a postagem de "${post.username}"?`)) return;
    try {
      await backoffice.deleteCommunityPost(post.id);
      flash("Postagem excluída.");
      void loadTab();
    } catch {
      flash("Falha ao excluir a postagem.", true);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Conteúdo</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Modere e complemente o conteúdo aplicado.</p>
      </section>

      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-800">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === item.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>
      ) : (
        <>
          {tab === "proofs" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><SectionTitle title="Provas enviadas" subtitle="Provas em anexo enviadas pelos alunos para revisão dos gabaritos." /></div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr><th className="px-5 py-3 font-semibold">Título</th><th className="px-5 py-3 font-semibold">Usuário</th><th className="px-5 py-3 font-semibold">Enviada em</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Ação</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {proofs.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Nenhuma prova enviada.</td></tr>}
                  {proofs.map((proof) => (
                    <tr key={proof.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{proof.title}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{proof.username}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(proof.created_at)}</td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[proof.status] ?? "bg-slate-100 text-slate-600"}`}>{statusLabel[proof.status] ?? proof.status}</span></td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={() => setProofStatus(proof)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                          {proof.status === "reviewed" ? "Marcar pendente" : "Marcar revisada"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tab === "news" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><SectionTitle title="Notícias" subtitle="Publique ou retire notícias do ar." /></div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr><th className="px-5 py-3 font-semibold">Título</th><th className="px-5 py-3 font-semibold">Categoria</th><th className="px-5 py-3 font-semibold">Publicada em</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Ação</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {news.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Nenhuma notícia encontrada.</td></tr>}
                  {news.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{item.title}</td>
                      <td className="px-5 py-3 text-slate-500">{item.category || "—"}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(item.published_at)}</td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.is_published ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{item.is_published ? "Publicada" : "Fora do ar"}</span></td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={() => setNewsPublished(item)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${item.is_published ? "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                          {item.is_published ? <><EyeOff size={13} /> Despublicar</> : <><Eye size={13} /> Publicar</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tab === "questions" && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} placeholder="Buscar por enunciado ou disciplina..." className="w-72 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {questions.length === 0 && <div className="px-5 py-10 text-center text-slate-500">Nenhuma questão sem comentário.</div>}
                {questions.map((question) => (
                  <div key={question.id} className="border-b border-slate-100 p-5 last:border-0 dark:border-slate-800">
                    <p className="text-xs text-slate-500">{question.banca} · {question.discipline}{question.exam_title ? ` · ${question.exam_title}` : ""} · #{question.id}</p>
                    <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{question.statement}{question.statement.length >= 160 ? "…" : ""}</p>
                    {explaining === question.id ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <textarea
                          value={drafts[question.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [question.id]: e.target.value }))}
                          rows={4}
                          placeholder="Escreva o comentário da questão..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => saveExplanation(question)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Salvar comentário</button>
                          <button type="button" onClick={() => setExplaining(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setExplaining(question.id)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        <PenLine size={14} /> Escrever comentário
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === "community" && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><SectionTitle title="Moderação" subtitle="Posts e respostas do fórum/feed. Excluir é irreversível." /></div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr><th className="px-5 py-3 font-semibold">Post</th><th className="px-5 py-3 font-semibold">Autor</th><th className="px-5 py-3 font-semibold">Tipo</th><th className="px-5 py-3 font-semibold">Respostas</th><th className="px-5 py-3 font-semibold">Criado em</th><th className="px-5 py-3 text-right font-semibold">Ação</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {community.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Nenhuma postagem.</td></tr>}
                  {community.map((post) => (
                    <tr key={post.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{post.title || "(sem título)"}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{post.username}</td>
                      <td className="px-5 py-3 text-slate-500">{post.kind}</td>
                      <td className="px-5 py-3 text-slate-500">{post.replies}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(post.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={() => deletePost(post)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20">
                          <Trash2 size={13} /> Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tab === "concursos" && (
            <section className="space-y-4">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={concursSearch} onChange={(e) => setConcursSearch(e.target.value)} placeholder="Buscar concurso..." className="w-72 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr><th className="px-5 py-3 font-semibold">Concurso</th><th className="px-5 py-3 font-semibold">Órgão</th><th className="px-5 py-3 font-semibold">UF</th><th className="px-5 py-3 font-semibold">Prazo</th><th className="px-5 py-3 font-semibold">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {concursos.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Nenhum concurso encontrado.</td></tr>}
                    {concursos.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{c.title}</td>
                        <td className="px-5 py-3 text-slate-500">{c.organization || "—"}</td>
                        <td className="px-5 py-3 text-slate-500">{c.state || "—"}</td>
                        <td className="px-5 py-3 text-slate-500">{formatDate(c.deadline)}</td>
                        <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[c.status] ?? "bg-slate-100 text-slate-600"}`}>{statusLabel[c.status] ?? c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}