import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FilterBar({ children, active, onClear }: { children: ReactNode; active: boolean; onClear: () => void }) {
  return <Card className="space-y-3 p-4"><div className="grid items-end gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">{children}</div>{active && <div className="flex items-center justify-between border-t pt-3"><p className="text-xs text-slate-500">Filtros aplicados à lista abaixo</p><Button variant="ghost" size="sm" onClick={onClear}>Limpar filtros</Button></div>}</Card>;
}

export function ListToolbar({ count, loading, ordering, onOrderingChange, options, children }: { count: number; loading: boolean; ordering: string; onOrderingChange: (value: string) => void; options: { value: string; label: string }[]; children?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><p className="text-sm font-medium" role="status" aria-live="polite">{loading ? "Atualizando resultados…" : `${count} registro${count === 1 ? "" : "s"} encontrado${count === 1 ? "" : "s"}`}</p>{children}</div><div className="flex items-center gap-2"><span className="text-xs text-slate-500">Ordenar por</span><Select value={ordering} onValueChange={onOrderingChange}><SelectTrigger className="w-44" aria-label="Ordenação dos resultados"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div></div>;
}

export function ListPagination({ count, page, pageSize, disabled, onPageChange, onPageSizeChange }: { count: number; page: number; pageSize: number; disabled?: boolean; onPageChange: (value: number) => void; onPageSizeChange: (value: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <nav aria-label="Paginação dos resultados" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-slate-500">{count ? `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} de ${count}` : "Nenhum registro"}</p><div className="flex flex-wrap items-center gap-2"><Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))} disabled={disabled}><SelectTrigger className="w-32" aria-label="Registros por página"><SelectValue /></SelectTrigger><SelectContent>{[12, 24, 48].map(size => <SelectItem key={size} value={String(size)}>{size} por página</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button><span className="px-1 text-xs" aria-current="page">{page} de {pages}</span><Button size="sm" variant="outline" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)}>Próxima</Button></div></nav>;
}

export function AdminFilterSelect({id, label, value, options, onChange, disabled}: {id: string; label: string; value: string; options: [string, string][]; onChange: (value: string) => void; disabled?: boolean}) {
  return <div className="min-w-0 space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><Select value={value || "all"} onValueChange={next => onChange(next === "all" ? "" : next)} disabled={disabled}><SelectTrigger id={id} className="w-full sm:min-w-44"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}
