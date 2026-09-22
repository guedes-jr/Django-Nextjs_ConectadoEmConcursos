export default function WhoWeAre() {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex items-center justify-center gap-5">
        <a
          href="#"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 dark:bg-slate-900 dark:ring-slate-800"
          aria-label="Instagram"
        >
          <span className="text-lg">◎</span>
        </a>
        <a
          href="#"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 dark:bg-slate-900 dark:ring-slate-800"
          aria-label="YouTube"
        >
          <span className="text-lg">▶</span>
        </a>
        <a
          href="#"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 dark:bg-slate-900 dark:ring-slate-800"
          aria-label="WhatsApp"
        >
          <span className="text-lg">✆</span>
        </a>
      </div>

      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
        <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 px-6 py-10 text-center text-white">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <span className="text-xl">🛡️</span>
          </div>
          <h2 className="text-2xl font-extrabold">Quem Somos</h2>
        </div>

        <div className="px-6 py-6 text-sm leading-7 text-slate-700 dark:text-slate-200">
          <p>
            O Conectado em Concursos nasceu da experiência real de um concurseiro
            que, assim como você, enfrenta diariamente os desafios da preparação
            para provas e seleções.
          </p>

          <p className="mt-4">
            Nosso site foi desenvolvido para ser{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              moderno, objetivo e prático
            </span>
            , reunindo em um só lugar as funções mais importantes e necessárias
            para quem estuda para concursos. Uma plataforma otimizada, pensada
            para facilitar o seu caminho e tornar sua preparação mais eficiente.
          </p>

          <p className="mt-4">
            Aqui, você encontra proximidade e conexão com pessoas que compartilham
            do mesmo sonho, trocando experiências, estratégias e motivação.
          </p>

          <p className="mt-6 text-center font-bold text-blue-700 dark:text-blue-300">
            🚀 Venha com a gente rumo à aprovação!
          </p>
        </div>
      </div>
    </div>
  );
}
