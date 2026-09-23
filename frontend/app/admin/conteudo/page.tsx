"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Eye, EyeOff, Trash2, PenLine } from "lucide-react";
import {
  backoffice,
  ProofRow,
  NewsAdminRow,
  QuestionAdminRow,
  CommunityPostRow,
  ConcursoRow,
  formatDate,
} from "@/lib/backoffice";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { StatusBadge, BadgeViolet } from "@/components/admin/StatusBadge";

type TabKey = "proofs" | "news" | "questions" | "community" | "concursos";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "proofs", label: "Provas enviadas" },
  { key: "news", label: "Notícias" },
  { key: "questions", label: "Questões sem comentário" },
  { key: "community", label: "Moderação" },
  { key: "concursos", label: "Concursos" },
];

function CardTable({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      {children}
    </Card>
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
      <PageHeader
        title="Conteúdo"
        description="Modere e complemente o conteúdo aplicado."
      />

      <Tabs value={tab} onValueChange={(v: string) => setTab(v as TabKey)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {loading ? (
        <LoadingState label="Carregando conteúdo..." />
      ) : (
        <>
          {tab === "proofs" && (
            <CardTable title="Provas enviadas" subtitle="Provas em anexo enviadas pelos alunos para revisão dos gabaritos.">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Título</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Enviada em</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proofs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <EmptyState title="Nenhuma prova enviada." />
                        </TableCell>
                      </TableRow>
                    )}
                    {proofs.map((proof) => (
                      <TableRow key={proof.id}>
                        <TableCell className="font-medium text-slate-800 dark:text-slate-100">{proof.title}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">{proof.username}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(proof.created_at)}</TableCell>
                        <TableCell><StatusBadge status={proof.status} /></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => void setProofStatus(proof)}>
                            {proof.status === "reviewed" ? "Marcar pendente" : "Marcar revisada"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CardTable>
          )}

          {tab === "news" && (
            <CardTable title="Notícias" subtitle="Publique ou retire notícias do ar.">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Título</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Publicada em</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {news.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <EmptyState title="Nenhuma notícia encontrada." />
                        </TableCell>
                      </TableRow>
                    )}
                    {news.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-slate-800 dark:text-slate-100">{item.title}</TableCell>
                        <TableCell className="text-slate-500">{item.category || "—"}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(item.published_at)}</TableCell>
                        <TableCell>
                          {item.is_published ? (
                            <BadgeViolet>Publicada</BadgeViolet>
                          ) : (
                            <StatusBadge status="pending" />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant={item.is_published ? "outline" : "default"} onClick={() => void setNewsPublished(item)}>
                            {item.is_published ? <><EyeOff className="h-4 w-4" /> Despublicar</> : <><Eye className="h-4 w-4" /> Publicar</>}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CardTable>
          )}

          {tab === "questions" && (
            <Card>
              <div className="flex flex-wrap items-center gap-3 p-5">
                <div className="relative min-w-56 flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    placeholder="Buscar por enunciado ou disciplina..."
                    className="pl-9"
                  />
                </div>
              </div>
              <CardContent className="p-0 md:p-0">
                {questions.length === 0 && (
                  <EmptyState title="Nenhuma questão sem comentário." />
                )}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {questions.map((question) => (
                    <div key={question.id} className="p-5">
                      <p className="text-xs text-slate-500">{question.banca} · {question.discipline}{question.exam_title ? ` · ${question.exam_title}` : ""} · #{question.id}</p>
                      <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{question.statement}{question.statement.length >= 160 ? "…" : ""}</p>
                      {explaining === question.id ? (
                        <div className="mt-3 flex flex-col gap-2">
                          <Textarea
                            value={drafts[question.id] ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [question.id]: e.target.value }))}
                            rows={4}
                            placeholder="Escreva o comentário da questão..."
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => void saveExplanation(question)}>Salvar comentário</Button>
                            <Button size="sm" variant="outline" onClick={() => setExplaining(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="mt-2 pl-0 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400" onClick={() => setExplaining(question.id)}>
                          <PenLine className="h-4 w-4" /> Escrever comentário
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {tab === "community" && (
            <CardTable title="Moderação" subtitle="Posts e respostas do fórum/feed. Excluir é irreversível.">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Post</TableHead>
                      <TableHead>Autor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Respostas</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {community.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <EmptyState title="Nenhuma postagem." />
                        </TableCell>
                      </TableRow>
                    )}
                    {community.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="font-medium text-slate-800 dark:text-slate-100">{post.title || "(sem título)"}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">{post.username}</TableCell>
                        <TableCell><StatusBadge status={post.kind} /></TableCell>
                        <TableCell className="text-slate-500">{post.replies}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(post.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => void deletePost(post)}>
                            <Trash2 className="h-4 w-4" /> Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CardTable>
          )}

          {tab === "concursos" && (
            <Card>
              <div className="p-5">
                <div className="relative max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={concursSearch}
                    onChange={(e) => setConcursSearch(e.target.value)}
                    placeholder="Buscar concurso..."
                    className="pl-9"
                  />
                </div>
              </div>
              <CardContent className="p-0 md:p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Concurso</TableHead>
                      <TableHead>Órgão</TableHead>
                      <TableHead>UF</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {concursos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <EmptyState title="Nenhum concurso encontrado." />
                        </TableCell>
                      </TableRow>
                    )}
                    {concursos.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-slate-800 dark:text-slate-100">{c.title}</TableCell>
                        <TableCell className="text-slate-500">{c.organization || "—"}</TableCell>
                        <TableCell className="text-slate-500">{c.state || "—"}</TableCell>
                        <TableCell className="text-slate-500">{formatDate(c.deadline)}</TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}