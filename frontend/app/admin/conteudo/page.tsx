"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Eye, EyeOff, FilePlus2, HelpCircle, Newspaper, PenLine, Search, Trash2 } from "lucide-react";
import {
  backoffice,
  ProofRow,
  NewsAdminRow,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConvertProofDialog } from "@/components/admin/content/ConvertProofDialog";
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

const managementItems = [
  { href: "/admin/bancas", title: "Bancas", description: "Nomes canônicos, siglas e aliases.", icon: Building2 },
  { href: "/admin/concursos", title: "Concursos", description: "Cadastros, editais e curadoria.", icon: Building2 },
  { href: "/admin/provas", title: "Provas", description: "Metadados, vínculos e visibilidade.", icon: FilePlus2 },
  { href: "/admin/questoes", title: "Questões", description: "Criação, edição e revisão editorial.", icon: HelpCircle },
  { href: "/admin/artigos", title: "Artigos", description: "Rascunhos, publicação e agenda.", icon: Newspaper },
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
  const [community, setCommunity] = useState<CommunityPostRow[]>([]);
  const [concursos, setConcursos] = useState<ConcursoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [concursSearch, setConcursSearch] = useState("");
  const [converting, setConverting] = useState<ProofRow | null>(null);

  const loadTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "proofs") setProofs((await backoffice.listProofs()).results);
      else if (tab === "news") setNews((await backoffice.listNews()).results);
      else if (tab === "community") setCommunity((await backoffice.listCommunity()).results);
      else if (tab === "concursos") setConcursos((await backoffice.listConcursos({ search: concursSearch })).results);
    } catch {
      setError("Não foi possível carregar esta seção.");
    } finally {
      setLoading(false);
    }
  }, [tab, concursSearch]);

  useEffect(() => {
    const timer = setTimeout(() => void loadTab(), concursSearch ? 300 : 0);
    return () => clearTimeout(timer);
  }, [tab, concursSearch, loadTab]);

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
        title="Conteúdos"
        description="Centralize os cadastros, a publicação e a moderação de todo o conteúdo da plataforma."
      />

      <section aria-labelledby="content-management-title">
        <div className="mb-3 flex items-baseline justify-between gap-4"><div><h2 id="content-management-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Gerenciamento editorial</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Cadastre e mantenha os principais conteúdos em um único lugar.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{managementItems.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"><Icon className="mb-3 h-5 w-5 text-indigo-600 transition group-hover:scale-110 dark:text-indigo-400" /><h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p></Link>)}</div>
      </section>

      <section aria-labelledby="content-operation-title"><div className="mb-3"><h2 id="content-operation-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Operação e moderação</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acompanhe envios, publicações e interações da comunidade.</p></div>
      <Tabs value={tab} onValueChange={(v: string) => setTab(v as TabKey)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      </section>

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
                        <TableCell>
                          <StatusBadge status={proof.status} />
                          {proof.converted_questions > 0 && (
                            <p className="mt-1 text-xs text-slate-500">{proof.converted_questions} questões geradas</p>
                          )}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {proof.status === "reviewed" && (
                            <Button size="sm" variant="outline" onClick={() => setConverting(proof)}>
                              Converter em questões
                            </Button>
                          )}
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

          {converting && (
            <ConvertProofDialog
              proof={converting}
              onOpenChange={(open) => !open && setConverting(null)}
              onConverted={(result) => {
                const created = result.counts.created ?? 0;
                flash(
                  result.status === "running"
                    ? `Execução #${result.id} iniciada.`
                    : `Prova convertida: ${created} questão${created === 1 ? "" : "ões"} na fila de aprovação.`,
                );
                void loadTab();
              }}
            />
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
              <CardContent className="space-y-3 p-5">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  A curadoria de questões foi para a tela própria: filtro por fonte, busca, duplicatas e
                  comentário com atalhos. Ela não pode ficar aqui, porque duas telas de revisão divergem
                  e o revisor passa a decidir em uma e commentar na outra.
                </p>
                <Button asChild>
                  <Link href="/admin/fila-questoes">
                    <PenLine className="h-4 w-4" /> Abrir a curadoria
                  </Link>
                </Button>
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