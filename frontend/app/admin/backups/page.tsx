"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, RotateCcw, Database } from "lucide-react";
import { backoffice, BackupRow, formatBytes, formatDate } from "@/lib/backoffice";
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
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";

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
      <PageHeader
        title="Backups"
        description={
          <>
            Instantâneos compactados do banco (SQLite) e da mídia, salvos em{" "}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs dark:bg-slate-800">backend/backups/</code>.
          </>
        }
        actions={
          <Button onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {creating ? "Criando..." : "Criar backup agora"}
          </Button>
        }
      />

      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        Restaurar substitui o banco e a mídia atuais pelos contidos no backup. O sistema deve ser reiniciado após a restauração — use isso com atenção.
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Carregando backups..." />
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <EmptyState
                        icon={<Database className="h-5 w-5" />}
                        title="Nenhum backup encontrado"
                        description="Crie o primeiro agora."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((backup) => (
                  <TableRow key={backup.name}>
                    <TableCell>
                      <p className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                        <Database className="h-4 w-4 text-indigo-500" /> {backup.name}
                      </p>
                    </TableCell>
                    <TableCell className="text-slate-500">{formatBytes(backup.size)}</TableCell>
                    <TableCell className="text-slate-500">{formatDate(backup.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === backup.name}
                        onClick={() => void restore(backup)}
                        className="border-amber-600 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-500 dark:text-amber-300 dark:hover:bg-amber-500/10"
                      >
                        {busy === backup.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {busy === backup.name ? "Restaurando..." : "Restaurar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}