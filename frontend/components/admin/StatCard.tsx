import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  hint,
  icon,
  accent = "indigo",
}: {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet";
}) {
  const accents: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
    sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
    violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{value}</p>
            {hint && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
          </div>
          {icon && (
            <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", accents[accent])}>{icon}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}