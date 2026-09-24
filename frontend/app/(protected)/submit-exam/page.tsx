"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, FileText, Link2, Loader2, Paperclip, Send, Trash2, Upload } from "lucide-react";

import { createSubmission, listSubmissions, type ExamSubmissionItem } from "@/lib/workspace";

type Method = "link" | "upload";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SubmitExamPage() {
  const [title, setTitle] = useState("");
  const [method, setMethod] = useState<Method>("link");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
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

  const switchMethod = (next: Method) => {
    setError(null);
    if (next === method) return;
    setMethod(next);
    if (next === "link") setFile(null);
    if (next === "upload") setSourceUrl("");
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createSubmission({
        title: title.trim(),
        description: description.trim(),
        source_url: method === "link" ? sourceUrl.trim() : undefined,
        file: method === "upload" ? file ?? undefined : undefined,
      });
      setTitle("");
      setSourceUrl("");
      setFile(null);
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

  const canSubmit =
    !!title.trim() && (method === "link" ? !!sourceUrl.trim() : !!file);

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
            <div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Como você quer enviar?
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => switchMethod("link")}
                  className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
                    method === "link"
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                >
                  <Link2 size={18} /> Enviar link
                </button>
                <button
                  type="button"
                  onClick={() => switchMethod("upload")}
                  className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
                    method === "upload"
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                >
                  <Upload size={18} /> Upload de arquivo
                </button>
              </div>
            </div>

            {method === "link" ? (
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
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Arquivo da prova (PDF, DOC, DOCX, TXT ou imagem — máx. 10 MB)
                </span>
                {file ? (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
                    <Paperclip size={18} className="shrink-0 text-blue-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{file.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      aria-label="Remover arquivo"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-sm font-semibold text-slate-500 transition hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-500">
                    <Upload size={18} /> Clique para selecionar o arquivo
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(event) => {
                        const selected = event.target.files?.[0] ?? null;
                        if (selected && selected.size > 10 * 1024 * 1024) {
                          setError("O arquivo deve ter no máximo 10 MB.");
                          setFile(null);
                        } else {
                          setError(null);
                          setFile(selected);
                        }
                        event.target.value = "";
                      }}
                    />
                  </label>
                )}
              </label>
            )}
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
              disabled={submitting || !canSubmit}
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
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <ExternalLink size={13} /> Ver link
                    </a>
                  ) : item.file_url ? (
                    <a
                      href={item.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <Paperclip size={13} /> Ver arquivo
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}