type Props = {
  greeting: string;
  quote: string;
  onResolve?: () => void;
};

export function HeroActions({ greeting, quote, onResolve }: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Meu Painel</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">👋 {greeting}</p>
      <p className="mt-1 text-slate-500 dark:text-slate-400 italic">“{quote}”</p>

      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <button
          onClick={onResolve}
          className="h-11 px-5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2"
        >
          📄 Resolver Questões
        </button>

        <button className="h-11 px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition font-semibold">
          🏆 Ver Ranking
        </button>
      </div>
    </div>
  );
}
