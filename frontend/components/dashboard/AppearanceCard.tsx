export function AppearanceCard() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        🎨 Personalizar Aparência
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="text-sm text-slate-600 mb-2">Cor Principal do Menu</div>
          <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2">
            <div className="h-8 w-10 rounded-lg bg-blue-600" />
            <div className="text-sm text-slate-700">#0464fc</div>
          </div>
        </div>

        <div>
          <div className="text-sm text-slate-600 mb-2">Tamanho dos ícones do Menu</div>
          <div className="flex items-center gap-2">
            <button className="h-9 w-9 rounded-lg border border-slate-200">P</button>
            <button className="h-9 w-9 rounded-lg bg-blue-600 text-white font-semibold">
              M
            </button>
            <button className="h-9 w-9 rounded-lg border border-slate-200">G</button>
          </div>
        </div>
      </div>
    </div>
  );
}
