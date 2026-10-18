"use client";

import { useEffect } from "react";

export function RenderError({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  useEffect(() => {
    // Deliberately omit message, stack, URL, user data and browser storage.
    const digest = error.digest?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    console.error(JSON.stringify({event: "ui.render_error", digest: digest || null}));
  }, [error]);
  return <main className="mx-auto max-w-xl p-8 text-center" role="alert">
    <h1 className="text-2xl font-semibold">Não foi possível abrir esta página</h1>
    <p className="mt-3">Tente novamente. Se o problema continuar, volte à página inicial.</p>
    <button type="button" className="mt-6 rounded-lg bg-blue-800 px-5 py-3 text-white" onClick={reset}>Tentar novamente</button>
    <button type="button" onClick={() => window.location.assign("/")} className="ml-4 underline">Página inicial</button>
  </main>;
}
