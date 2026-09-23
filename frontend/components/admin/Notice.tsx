import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function Notice({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    error: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  } as const;
  const Icon = kind === "error" ? AlertTriangle : kind === "success" ? Check : Info;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm", styles[kind])}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, description }: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">{icon}</div>}
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  );
}