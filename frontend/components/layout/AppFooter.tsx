"use client";

type Props = {
  onResolveNow?: () => void;
};

export function AppFooter({ onResolveNow }: Props) {
  return (
    <footer className="mt-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="dashboard-footer rounded-2xl p-10 relative overflow-hidden shadow-lg">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="text-5xl">🏆</div>
            <h3 className="text-2xl font-bold">
              Continue firme na sua jornada!
            </h3>
            <p className="text-white/90">
              Cada questão resolvida te aproxima mais da sua aprovação
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <button
                onClick={onResolveNow}
                className="dashboard-footer-primary h-11 rounded-xl px-6 font-semibold"
              >
                ✅ Resolver Questões Agora
              </button>

              <button className="dashboard-footer-secondary h-11 rounded-xl px-6 font-semibold">
                Ver Ranking
              </button>
            </div>
          </div>

          <div className="absolute right-6 top-6">
            <button className="dashboard-footer-secondary rounded-xl px-3 py-2 text-xs">
              🌙 Escuro
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
