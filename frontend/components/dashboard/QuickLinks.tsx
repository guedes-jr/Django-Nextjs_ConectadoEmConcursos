export function QuickLinks() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="font-semibold text-slate-900">Links Rápidos</div>

      <div className="mt-4 space-y-2">
        <div className="h-10 rounded-xl border border-slate-200 flex items-center px-3 text-slate-600">
          🔎 Encontrar Concursos
        </div>
        <div className="h-10 rounded-xl border border-slate-200 flex items-center px-3 text-slate-600">
          🗓 Cronograma de Estudos
        </div>
        <div className="h-10 rounded-xl border border-slate-200 flex items-center px-3 text-slate-600">
          🏆 Ver Ranking
        </div>
        <div className="h-10 rounded-xl border border-slate-200 flex items-center px-3 text-slate-600">
          📊 Estatísticas Detalhadas
        </div>
      </div>
    </div>
  );
}
