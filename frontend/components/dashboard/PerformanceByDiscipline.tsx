import { DisciplinePerformance } from "@/lib/statistics";

export function PerformanceByDiscipline({ data }: { data: DisciplinePerformance[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="font-semibold text-slate-900 dark:text-slate-100">📚 Performance por disciplina</div>
      {data.length ? (
        <div className="mt-5 space-y-4">
          {data.map((item) => (
            <div key={item.discipline}>
              <div className="mb-1 flex justify-between gap-4 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">{item.discipline}</span><span className="text-slate-500">{item.correct}/{item.total} · {item.accuracy}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${item.accuracy}%` }} /></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 text-slate-400 dark:border-slate-800"><div className="text-3xl">📖</div><div>Resolva questões para ver suas estatísticas</div></div>
      )}
    </div>
  );
}
