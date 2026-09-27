"use client";

import { useEffect, useState } from "react";
import { FileUp, Loader2, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/admin/Notice";
import { backoffice, type ConvertedProof, type ProofRow } from "@/lib/backoffice";
import { apiMessage } from "@/lib/content";

type Props = {
  proof: ProofRow | null;
  onOpenChange: (open: boolean) => void;
  onConverted: (result: ConvertedProof) => void;
};

const PLACEHOLDER = `Cole aqui o XML, o JSON ou o CSV da prova.

{
  "questions": [
    {
      "statement": "Enunciado",
      "options": ["A", "B", "C", "D"],
      "correct_answer": 2,
      "banca": "CEBRASPE",
      "year": 2024,
      "discipline": "Direito Constitucional",
      "number": 1
    }
  ]
}`;

/**
 * Converte a prova enviada pelo aluno em questões.
 *
 * O aluno normalmente manda PDF ou link, que não é parseável: quem converte cola o
 * XML/JSON aqui ou sobe o arquivo. As questões nascem `PENDING` e entram na mesma
 * fila das fontes oficiais — nada vai para o aluno sem passar pela curadoria.
 */
export function ConvertProofDialog({ proof, onOpenChange, onConverted }: Props) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proof) return;
    setContent("");
    setFile(null);
    setError(null);
    setDryRun(false);
    setRightsConfirmed(proof.rights_confirmed);
  }, [proof]);

  if (!proof) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await backoffice.convertProof({
        id: proof.id,
        content: file ? "" : content,
        file: file ?? undefined,
        rights_confirmed: rightsConfirmed,
        dry_run: dryRun,
      });
      onOpenChange(false);
      onConverted(result);
    } catch (err) {
      setError(apiMessage((err as { response?: { data?: unknown } })?.response?.data, "Não foi possível converter a prova."));
    } finally {
      setBusy(false);
    }
  };

  const needsRights = !proof.rights_confirmed;
  const canRun = !busy && rightsConfirmed && (!!file || content.trim().length > 0);

  return (
    <Dialog open={!!proof} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Converter em questões</DialogTitle>
          <DialogDescription>
            {proof.title} · enviada por {proof.username}
          </DialogDescription>
        </DialogHeader>

        {(proof.file_url || proof.source_url || proof.description) && (
          <div className="space-y-1 rounded-lg border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {proof.file_url && (
              <a href={proof.file_url} target="_blank" rel="noreferrer" className="underline">
                Abrir o arquivo enviado
              </a>
            )}
            {proof.source_url && (
              <a href={proof.source_url} target="_blank" rel="noreferrer" className="block underline">
                Abrir o link enviado
              </a>
            )}
            {proof.description && <p className="whitespace-pre-wrap">{proof.description}</p>}
          </div>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        <div className="space-y-1.5">
          <Label htmlFor="convert-file">Arquivo XML, JSON ou CSV (opcional)</Label>
          <input
            id="convert-file"
            type="file"
            accept=".xml,.json,.csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold dark:text-slate-300 dark:file:bg-slate-800"
          />
          <p className="text-xs text-slate-500">
            Com arquivo, o campo abaixo é ignorado. PDF e imagem não são parseáveis: transcreva o
            enunciado no campo ou envie o arquivo estruturado.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="convert-content">Conteúdo da prova</Label>
          <Textarea
            id="convert-content"
            value={content}
            rows={12}
            spellCheck={false}
            disabled={!!file}
            placeholder={PLACEHOLDER}
            onChange={(event) => setContent(event.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <Checkbox
            checked={rightsConfirmed}
            onCheckedChange={(value) => setRightsConfirmed(value === true)}
            aria-label="Confirmar autorização de direitos"
          />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Confirmei que o envio tem autorização para virar questão publicada.
            {needsRights && (
              <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
                Este envio é anterior à exigência de declaração, então a confirmação fica
                registrada com o seu nome.
              </span>
            )}
          </span>
        </label>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={dryRun}
            onCheckedChange={(value) => setDryRun(value === true)}
            aria-label="Simular sem gravar"
          />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Simular sem gravar (conta as questões sem criar)
          </span>
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void run()} disabled={!canRun}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : dryRun ? <FileUp className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
            {dryRun ? "Simular" : "Converter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
