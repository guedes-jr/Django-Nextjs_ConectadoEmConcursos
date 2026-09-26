"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";

export default function OfflinePage() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Image
          src="/icons/icon-192.png"
          alt="Conectado em Concursos"
          width={80}
          height={80}
          className="mx-auto rounded-2xl"
          priority
          unoptimized
        />

        <div className="mx-auto mt-6 grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          <CloudOff size={26} />
        </div>

        <h1 className="mt-4 text-xl font-semibold">Você está sem conexão</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Não foi possível carregar o Conectado em Concursos. Verifique sua internet e
          tente novamente. O app continua instalado e volta a funcionar assim que a
          conexão voltar.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow transition-colors hover:bg-blue-700 active:scale-[0.98]"
          >
            <RefreshCw size={16} />
            Tentar novamente
          </button>

          {online ? (
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Wifi size={16} />
              Ir para o login
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
