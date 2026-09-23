"use client";

export type BarDatum = {
  label: string;
  value: number;
};

export function BarChart({
  data,
  color = "bg-indigo-500",
  height = 36,
  formatValue,
}: {
  data: BarDatum[];
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Sem dados no período.</p>;
  }

  return (
    <div className="flex items-end gap-1.5">
      {data.map((d, i) => {
        const h = Math.max(2, Math.round((d.value / max) * 100));
        return (
          <div key={i} className="group relative flex flex-1 flex-col items-center gap-1.5" title={d.label}>
            <div className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block dark:bg-slate-100 dark:text-slate-900">
              {formatValue ? formatValue(d.value) : d.value}
            </div>
            <div
              className={`w-full rounded-sm ${color} ${d.value === 0 ? "opacity-20" : ""}`}
              style={{ height: `${(h / 100) * height}px` }}
            />
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}