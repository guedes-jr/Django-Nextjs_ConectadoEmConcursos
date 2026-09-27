"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Filter, Loader2, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/admin/Notice";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/utils";
import { content, type ContentSource, type QueueFilters, type ReviewQuestion, type SearchRun } from "@/lib/content";

export type QueueState = {
  results: ReviewQuestion[];
  total: number;
  loading: boolean;
  error: string | null;
};

type Props = {
  state: QueueState;
  selectedId: number | null;
  onSelect: (question: ReviewQuestion) => void;
  filters: QueueFilters;
  onFiltersChange: (filters: QueueFilters) => void;
  sources: ContentSource[];
  selectedSource: string;
  onSourceChange: (slug: string) => void;
  runId: number | null;
  onRunIdChange: (id: number | null) => void;
  run: SearchRun | null;
  onOpenSearch: () => void;
  onReload: () => void;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Rejeitadas" },
  { value: "", label: "Todos os status" },
];

export function QueueList({
  state,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
  sources,
  selectedSource,
  onSourceChange,
  runId,
  onRunIdChange,
  run,
  onOpenSearch,
  onReload,
  listOpen,
  onListOpenChange,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const [runs, setRuns] = useState<SearchRun[]>([]);
  const [search, setSearch] = useState(filters.search ?? "");
  const [banca, setBanca] = useState(filters.banca ?? "");
  const [discipline, setDiscipline] = useState(filters.discipline ?? "");
  const [year, setYear] = useState(filters.year ?? "");
  const [duplicates, setDuplicates] = useState(Boolean(filters.duplicates));
  const [conflict, setConflict] = useState(Boolean(filters.conflict));

  // O histórico de buscas é por fonte: trocar de fonte descarta a execução escolhida.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await content.runs({ source: selectedSource || undefined, limit: 20 });
        if (active) setRuns(data.results);
      } catch {
        if (active) setRuns([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedSource]);

  const apply = (patch: Partial<QueueFilters>) => {
    onFiltersChange({ ...filters, ...patch, offset: 0 });
  };

  const submitText = () => apply({ search: search.trim() || undefined });

  if (!listOpen) {
    return (
      <div className="lg:w-12">
        <Button variant="ghost" size="icon" aria-label="Abrir lista" onClick={() => onListOpenChange(true)}>
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 lg:w-96 lg:shrink-0">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Recolher lista" onClick={() => onListOpenChange(false)}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
        <p className="flex-1 text-sm font-medium text-slate-900 dark:text-slate-100">
          {state.total} questão{state.total === 1 ? "" : "ões"}
        </p>
        <Button variant="ghost" size="icon" aria-label="Recarregar fila" onClick={onReload} disabled={state.loading}>
          <RefreshCw className={cn("h-4 w-4", state.loading && "animate-spin")} />
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenSearch}>
          Buscar questões
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={search}
          placeholder="Buscar no enunciado"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitText();
          }}
        />
        <Button variant="secondary" onClick={submitText}>
          Ok
        </Button>
      </div>

      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setShowFilters((open) => !open)}>
        <Filter className="h-4 w-4" />
        Filtros
        <span className="ml-auto text-xs text-slate-500">
          {selectedSource ? sources.find((item) => item.slug === selectedSource)?.label : "Todas as fontes"}
        </span>
      </Button>

      {showFilters && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="space-y-1.5">
            <Label htmlFor="filter-source">Fonte</Label>
            <select
              id="filter-source"
              value={selectedSource}
              onChange={(event) => {
                onSourceChange(event.target.value);
                onRunIdChange(null);
              }}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Todas as fontes</option>
              {sources.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-run">Busca</Label>
            <select
              id="filter-run"
              value={runId ?? ""}
              onChange={(event) => onRunIdChange(event.target.value ? Number(event.target.value) : null)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Todas as buscas</option>
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.id} · {item.name}
                </option>
              ))}
            </select>
            {run && (
              <p className="text-xs text-slate-500">
                {run.questions_count ?? 0} questões · {run.status}
                {run.next_page ? ` · página ${run.next_page}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-status">Status</Label>
            <select
              id="filter-status"
              value={filters.status ?? "pending"}
              onChange={(event) => apply({ status: event.target.value || undefined })}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="filter-banca">Banca</Label>
              <Input id="filter-banca" value={banca} onChange={(event) => setBanca(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-discipline">Disciplina</Label>
              <Input
                id="filter-discipline"
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-year">Ano</Label>
            <Input id="filter-year" value={year} inputMode="numeric" onChange={(event) => setYear(event.target.value)} />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-duplicates"
                checked={duplicates}
                onCheckedChange={(value) => {
                  setDuplicates(value === true);
                  apply({ duplicates: value === true ? "1" : undefined });
                }}
              />
              <Label htmlFor="filter-duplicates" className="font-normal">
                Só duplicatas
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-conflict"
                checked={conflict}
                onCheckedChange={(value) => {
                  setConflict(value === true);
                  apply({ conflict: value === true ? "1" : undefined });
                }}
              />
              <Label htmlFor="filter-conflict" className="font-normal">
                Só conflitos
              </Label>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setBanca("");
              setDiscipline("");
              setYear("");
              setDuplicates(false);
              setConflict(false);
              apply({ banca: undefined, discipline: undefined, year: undefined, duplicates: undefined, conflict: undefined });
            }}
          >
            <ChevronLeft className="h-4 w-4" /> Limpar filtros
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {state.loading && (
          <p className="flex items-center gap-2 px-1 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fila...
          </p>
        )}
        {!state.loading && state.results.length === 0 && (
          <EmptyState
            title="Fila em dia"
            description="Nenhuma questão com esses filtros. Inicie uma nova busca para continuar."
          />
        )}
        {state.results.map((question) => (
          <button
            key={question.id}
            type="button"
            onClick={() => onSelect(question)}
            className={cn(
              "w-full space-y-1 rounded-lg border px-3 py-2 text-left transition",
              selectedId === question.id
                ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                : "border-slate-200 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-indigo-500/40",
            )}
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">#{question.id}</span>
              <StatusBadge status={question.status} />
              {question.duplicates.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {question.duplicates.length} parecida{question.duplicates.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">
              {question.statement.replace(/\[\[image:[^\]]+\]\]/g, " [imagem] ")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {question.source?.label ?? "—"} · {question.banca || "—"} · {question.discipline} · {question.year}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
