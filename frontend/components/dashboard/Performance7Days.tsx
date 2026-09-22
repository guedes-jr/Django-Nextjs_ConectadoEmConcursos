import { DailyPerformance } from "@/lib/statistics";

export function Performance7Days({ data }: { data: DailyPerformance[] }) {
  const max = Math.max(...data.map((item) => item.total), 1);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="font-semibold text-slate-900 dark:text-slate-100">📈 Atividade dos últimos 7 dias</div>
      <div className="mt-6 flex h-48 items-end gap-3" aria-label="Questões respondidas por dia">
        {data.map((item) => (
          <div key={item.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item.total}</span>
            <div className="relative w-full max-w-12 overflow-hidden rounded-t-md bg-blue-100 dark:bg-blue-950" style={{ height: `${Math.max(item.total ? 12 : 2, item.total * 120 / max)}px` }}>
              <div className="absolute bottom-0 w-full bg-green-500" style={{ height: `${item.accuracy}%` }} title={`${item.accuracy}% de acerto`} />
            </div>
            <span className="text-xs capitalize text-slate-500">{new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500"><span>■ Atividade</span><span className="text-green-600">■ Acertos</span></div>
    </div>
  );
}
