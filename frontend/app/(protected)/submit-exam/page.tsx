"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, FileText, Loader2, Send } from "lucide-react";

import { createSubmission, listSubmissions, type ExamSubmissionItem } from "@/lib/workspace";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SubmitExamPage() {
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ExamSubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listSubmissions()
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar os envios anteriores.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createSubmission({
        title: title.trim(),
        source_url: sourceUrl.trim(),
        description: description.trim(),
      });
      setTitle("");
      setSourceUrl("");
      setDescription("");
      setSuccess("Prova enviada com sucesso. Nossa equipe vai revisar e liberar as questões em breve.");
      const data = await listSubmissions();
      setItems(data);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail ?? "Não foi possível enviar a prova.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <FileText className="text-blue-600" /> Enviar Prova
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Tem uma prova de concurso e quer ajudar a comunidade? Envie o link e nossa equipe vai
            transformá-la em questões comentadas.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Título da prova</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Concurso Prefeitura de Campinas 2026"
                maxLength={160}
                required
                className="h-11 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Link da prova (HTTPS)</span>
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://..."
                maxLength={200}
                type="url"
                required
                className="h-11 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Observações <span className="font-normal text-slate-400">(opcional)</span>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Banca, ano, áreas cobertas, links adicionais..."
                maxLength={2000}
                rows={3}
                className="rounded-lg border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700 dark:text-slate-100"
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !title.trim() || !sourceUrl.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {submitting ? "Enviando..." : "Enviar prova"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Clock size={16} className="text-blue-600" /> Meus envios
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
              <FileText className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Você ainda não enviou nenhuma prova.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{item.title}</p>
                    {item.status === "reviewed" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        <CheckCircle2 size={13} /> Revisada
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                        <Clock size={13} /> Pendente
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</p>
                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <ExternalLink size={13} /> Ver link
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}