"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/admin/Notice";
import { content, apiMessage, type ContentSource, type FilterSpec, type SearchRun } from "@/lib/content";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinished: (run: SearchRun) => void;
};

/** Passo 1: fonte. Passo 2: filtros declarados por ela. */
export function SearchDialog({ open, onOpenChange, onFinished }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [source, setSource] = useState<ContentSource | null>(null);
  const [specs, setSpecs] = useState<FilterSpec[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState("200");
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError(null);
    void (async () => {
      try {
        setSources(await content.sources());
      } catch {
        setError("Não foi possível carregar as fontes.");
      }
    })();
  }, [open]);

  // Trocar de fonte descarta o formulário: `banca` na fonte A e `banca` na fonte
  // B podem significar coisas diferentes, e reaproveitar o valor seria silencioso.
  const chooseSource = useCallback(async (next: ContentSource) => {
    setSource(next);
    setValues({});
    setError(null);
    setLoading(true);
    try {
      const data = await content.sourceFilters(next.slug);
      setSpecs(data.filters);
      setStep(2);
    } catch (err) {
      setError(apiMessage((err as { response?: { data?: unknown } })?.response?.data, "Não foi possível ler os filtros da fonte."));
    } finally {
      setLoading(false);
    }
  }, []);

  const missingRequired = useMemo(
    () => specs.filter((spec) => spec.required && !String(values[spec.key] ?? "").trim()),
    [specs, values],
  );

  const run = async () => {
    if (!source) return;
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, unknown> = {};
      specs.forEach((spec) => {
        const value = values[spec.key];
        if (value === undefined || value === "") return;
        filters[spec.key] = spec.kind === "int_range" && value.includes(":")
          ? value.split(":").map((part) => Number(part.trim()))
          : value;
      });
      const created = await content.startSearch({
        source: source.slug,
        filters,
        limit: Number(limit) || 200,
        dry_run: dryRun,
      });
      onOpenChange(false);
      onFinished(created);
    } catch (err) {
      setError(apiMessage((err as { response?: { data?: unknown } })?.response?.data, "Falha ao executar a busca."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buscar questões</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "1 de 2 · Escolha a fonte. Cada execução usa uma fonte só."
              : `2 de 2 · Filtros de ${source?.label ?? ""}.`}
          </DialogDescription>
        </DialogHeader>

        {error && <Notice kind="error">{error}</Notice>}

        {step === 1 ? (
          <ul className="space-y-2">
            {sources.length === 0 && !error && (
              <li className="text-sm text-slate-500">Nenhuma fonte ativa cadastrada.</li>
            )}
            {sources.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => void chooseSource(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/60 dark:border-slate-700 dark:hover:bg-indigo-500/10"
                >
                  <span>
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {item.slug} · {item.kind} · {item.license_name || "sem licença"}
                    </span>
                  </span>
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-4">
            {specs.length === 0 && (
              <p className="text-sm text-slate-500">Esta fonte não declara filtros.</p>
            )}
            {specs.map((spec) => (
              <div key={spec.key} className="space-y-1.5">
                <Label htmlFor={`spec-${spec.key}`}>
                  {spec.label}
                  {spec.required && <span className="text-rose-600"> *</span>}
                </Label>
                {spec.kind === "select" || spec.kind === "multiselect" ? (
                  <select
                    id={`spec-${spec.key}`}
                    value={values[spec.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [spec.key]: event.target.value }))}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">{spec.multiple ? "Todos" : "Todos"}</option>
                    {spec.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                        {typeof option.count === "number" ? ` (${option.count})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`spec-${spec.key}`}
                    value={values[spec.key] ?? ""}
                    placeholder={spec.kind === "int_range" ? "2020:2024" : spec.help_text}
                    onChange={(event) => setValues((current) => ({ ...current, [spec.key]: event.target.value }))}
                  />
                )}
                {spec.help_text && <p className="text-xs text-slate-500">{spec.help_text}</p>}
              </div>
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="search-limit">Limite</Label>
                <Input
                  id="search-limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Checkbox id="search-dry-run" checked={dryRun} onCheckedChange={(value) => setDryRun(value === true)} />
                <Label htmlFor="search-dry-run" className="font-normal">
                  Simular sem gravar
                </Label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
              <ArrowLeft className="h-4 w-4" /> Trocar de fonte
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} className="bg-rose-600 text-white shadow-sm transition hover:bg-rose-700 hover:shadow-md dark:bg-rose-500 dark:text-rose-950 dark:hover:bg-rose-400">
            Cancelar
          </Button>
          <Button onClick={() => void run()} disabled={loading || step !== 2 || !source || missingRequired.length > 0} className="bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md disabled:bg-slate-400 disabled:text-slate-100 dark:bg-blue-500 dark:text-blue-950 dark:hover:bg-blue-400">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Executar busca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
