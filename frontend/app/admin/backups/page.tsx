"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, RotateCcw, Check, AlertTriangle, Database } from "lucide-react";
import { backoffice, BackupRow, formatBytes, formatDate } from "@/lib/backoffice";

export default function AdminBackupsPage() {
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backoffice.listBackups();
      setRows(res.results);
    } catch {
      setError("Não foi possível listar os backups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await backoffice.createBackup();
      setNotice("Backup criado com sucesso.");
      void load();
    } catch {
      setError("Falha ao criar o backup. Verifique o servidor.");
    } finally {
      setCreating(false);
    }
  };

  const restore = async (backup: BackupRow) => {
    if (!window.confirm(
      `Restaurar o backup ${backup.name}?\n\nO banco e a mídia atuais serão substituídos. Um cópia .bak do banco atual será mantida (db.sqlite3.bak). Reinicie o Django depois de restaurar.`
    )) return;
    setBusy(backup.name);
    setError(null);
    setNotice(null);
    try {
      const result = await backoffice.restoreBackup(backup.name);
      setNotice(`Backup ${result.restored} restaurado. Banco anterior salvo em ${result.previous_db_saved_at}. Faça logout e reinicie o Django.`);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Falha ao restaurar o backup.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Backups</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Instantâneos compactados do banco (SQLite) e da mídia, salvos em <code className="rounded bg-slate-200 px-1 py-0.5 text-xs dark:bg-slate-800">backend/backups/</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {creating ? "Criando..." : "Criar backup agora"}
        </button>
      </section>

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check size={16} className="mt-0.5 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        Restaurar substitui o banco e a mídia atuais pelos contidos no backup. O sistema deve ser reiniciado após a restauração — use isso com atenção.
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Arquivo</th>
                <th className="px-5 py-3 font-semibold">Tamanho</th>
                <th className="px-5 py-3 font-semibold">Criado em</th>
                <th className="px-5 py-3 text-right font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr><td colSpan={4} className="px-5 py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">Nenhum backup encontrado. Crie o primeiro agora.</td></tr>
              )}
              {!loading && rows.map((backup) => (
                <tr key={backup.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3">
                    <p className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                      <Database size={15} className="text-indigo-500" /> {backup.name}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatBytes(backup.size)}</td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(backup.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy === backup.name}
                      onClick={() => restore(backup)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {busy === backup.name ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      {busy === backup.name ? "Restaurando..." : "Restaurar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}