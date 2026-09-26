"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloading = false;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(registration.waiting ?? installing);
            }
          });
        });

        window.setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      } catch {
        return;
      }
    };

    register();

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  const activateUpdate = () => {
    setWaiting(null);
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div className="safe-top fixed inset-x-3 top-3 z-[170] sm:inset-x-auto sm:left-1/2 sm:top-6 sm:w-[26rem] sm:-translate-x-1/2">
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-white p-4 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <RefreshCw size={18} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Nova versão disponível</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Atualize para entrar em contato com os últimos recursos do app.
          </p>
        </div>
        <button
          type="button"
          onClick={activateUpdate}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          Atualizar
        </button>
        <button
          type="button"
          aria-label="Dispensar"
          onClick={() => setWaiting(null)}
          className="shrink-0 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
