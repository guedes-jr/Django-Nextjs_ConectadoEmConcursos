"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ExternalLink } from "lucide-react";

import { QuestionContent } from "@/components/QuestionContent";
import { getArticle, getNews, NewsArticle } from "@/lib/news";

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function ContentDetails({ kind }: { kind: "articles" | "news" }) {
  const editorial = kind === "articles";
  const fetchContent = editorial ? getArticle : getNews;
  const params = useParams<{ slug: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setArticle(null);setLoading(true);setNotFound(false);setError(false);
    fetchContent(params.slug)
      .then((data) => {
        if (active) setArticle(data);
      })
      .catch((error: {response?: {status?: number}}) => {
        if (active) {if(error.response?.status===404)setNotFound(true);else setError(true);}
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.slug,retry,fetchContent]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href={editorial ? "/artigos" : "/noticias"}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
          >
            <ArrowLeft size={15} /> Voltar para {editorial ? "artigos" : "notícias"}
          </Link>

          {loading && <p className="text-slate-500 dark:text-slate-400">Carregando conteúdo…</p>}

          {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-300">Não foi possível carregar o conteúdo. <button type="button" className="underline" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></p>}

          {notFound && (
            <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">
              Conteúdo não encontrado ou indisponível.
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
                <QuestionContent text={article.body} className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300" />
              )}
              {article.source_url && (
                <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    {editorial ? "Consultar referência" : "Ler completa na fonte"} <ExternalLink size={15} />
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