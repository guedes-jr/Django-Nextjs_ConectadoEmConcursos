"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Newspaper, Search } from "lucide-react";

import { buildPageList } from "@/lib/pagination";
import { listNews, NewsArticle } from "@/lib/news";

const PAGE_SIZE = 20;

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function NoticiasPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const resultsRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const offset = (targetPage - 1) * PAGE_SIZE;
      const data = await listNews({
        search: search || undefined,
        category: category || undefined,
        limit: PAGE_SIZE,
        offset,
        facets: offset === 0,
      });
      setArticles(data.results);
      setTotal(data.count);
      setPage(targetPage);
      if (data.facets?.categories) {
        setCategories(data.facets.categories.map((item) => item.category));
      }
    } catch {
      setError("Não foi possível carregar as notícias.");
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (targetPage: number) => {
    if (targetPage === page || targetPage < 1 || targetPage > totalPages) return;
    void load(targetPage);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pageNumbers = useMemo(
    () => buildPageList(page, totalPages),
    [page, totalPages],
  );

  const orderedCategories = useMemo(
    () => [
      ...categories.filter((item) => item === "Destaques"),
      ...categories.filter((item) => item !== "Destaques"),
    ],
    [categories],
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Notícias sobre concursos</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Editais, retificações, prorrogações e novidades reunidas de várias fontes em um só lugar.
          </p>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Buscar notícia</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título ou assunto"
              className="h-10 w-full rounded-lg border border-slate-300 bg-transparent pl-9 pr-3 text-sm dark:border-slate-700 dark:text-slate-100"
            />
          </label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Categoria"
            className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Todas as categorias</option>
            {orderedCategories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </section>

        {!loading && !error && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {total} {total === 1 ? "notícia encontrada" : "notícias encontradas"}
          </p>
        )}

        {loading && <p className="text-slate-500 dark:text-slate-400">Carregando notícias…</p>}
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <section ref={resultsRef} className="scroll-mt-24 space-y-3">
          {articles.map((article) => (
            <article
              key={article.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700 md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {article.category && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      {article.category}
                    </span>
                  )}
                  {article.published_at && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <CalendarDays size={13} /> {formatDate(article.published_at)}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">
                  {article.title}
                </h2>
                {article.summary && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                    {article.summary}
                  </p>
                )}
              </div>
              {article.source_url && (
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                >
                  Ler notícia <ArrowRight size={15} />
                </a>
              )}
            </article>
          ))}
        </section>

        {!loading && !error && articles.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">
            Nenhuma notícia encontrada.
          </p>
        )}

        {totalPages > 1 && !loading && (
          <nav aria-label="Paginação" className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
            >
              <ArrowLeft size={15} /> Anterior
            </button>
            {pageNumbers.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-2 py-2 text-slate-400">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => goToPage(item)}
                  aria-current={item === page ? "page" : undefined}
                  className={`min-w-9 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    item === page
                      ? "bg-blue-600 text-white"
                      : "bg-white text-blue-600 ring-1 ring-slate-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                  }`}
                >
                  {item}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
            >
              Próxima <ArrowRight size={15} />
            </button>
          </nav>
        )}
        {totalPages > 1 && (
          <p className="text-center text-xs text-slate-400">
            Página {page} de {totalPages} · {total} notícias
          </p>
        )}

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-900 dark:bg-blue-950/40">
          <Newspaper className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" />
          <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Nada de perder prazo</h3>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-300">
            Encontre todos os concursos com inscrições abertas e monte seu plano de estudos em minutos.
          </p>
          <Link
            href="/concursos"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Ver concursos abertos <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </main>
  );
}