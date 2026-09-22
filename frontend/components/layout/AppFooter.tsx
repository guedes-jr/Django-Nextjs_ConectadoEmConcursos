"use client";

type Props = {
  onResolveNow?: () => void;
};

export function AppFooter({ onResolveNow }: Props) {
  return (
    <footer className="mt-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="rounded-2xl bg-blue-600 text-white p-10 relative overflow-hidden shadow-lg">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="text-5xl">🏆</div>
            <h3 className="text-2xl font-bold">Continue firme na sua jornada!</h3>
            <p className="text-white/90">
              Cada questão resolvida te aproxima mais da sua aprovação
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <button
                onClick={onResolveNow}
                className="h-11 px-6 rounded-xl bg-white dark:bg-slate-900 text-blue-700 font-semibold hover:bg-white/90 transition"
              >
                ✅ Resolver Questões Agora
              </button>

              <button className="h-11 px-6 rounded-xl bg-white/15 hover:bg-white/20 transition font-semibold">
                Ver Ranking
              </button>
            </div>
          </div>

          <div className="absolute right-6 top-6">
            <button className="text-xs bg-white/15 hover:bg-white/20 px-3 py-2 rounded-xl">
              🌙 Escuro
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
