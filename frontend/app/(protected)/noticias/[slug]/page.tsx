"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ExternalLink } from "lucide-react";

import { getNews, NewsArticle } from "@/lib/news";

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function NoticiaPage() {
  const params = useParams<{ slug: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    getNews(params.slug)
      .then((data) => {
        if (active) setArticle(data);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.slug]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href="/noticias"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
          >
            <ArrowLeft size={15} /> Voltar para notícias
          </Link>

          {loading && <p className="text-slate-500 dark:text-slate-400">Carregando notícia…</p>}

          {notFound && (
            <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">
              Notícia não encontrada.
            </p>
          )}

          {article && (
            <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2">
                {article.category && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    {article.category}
                  </span>
                )}
                {article.published_at && (
                  <span className="flex items-center gap-1 text-sm text-slate-400">
                    <CalendarDays size={14} /> {formatDate(article.published_at)}
                  </span>
                )}
              </div>
              <h1 className="mt-4 text-2xl font-bold leading-tight text-slate-900 dark:text-slate-100">
                {article.title}
              </h1>
              {article.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.image_url}
                  alt={article.title}
                  className="mt-5 aspect-video w-full rounded-xl object-cover"
                />
              )}
              {article.summary && (
                <p className="mt-5 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {article.summary}
                </p>
              )}
              {article.body && (
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {article.body.split(/\n{2,}/).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              )}
              {article.source_url && (
                <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    Ler completa na fonte <ExternalLink size={15} />
                  </a>
                  <Link
                    href="/concursos"
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800"
                  >
                    Ver concursos abertos <ArrowRight size={15} />
                  </Link>
                </div>
              )}
            </article>
          )}
        </div>
    </main>
  );
}