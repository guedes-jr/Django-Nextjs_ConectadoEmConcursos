"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, Square, X } from "lucide-react";

const DISMISS_KEY = "cq_install_dismissed_at";
const DISMISS_DAYS = 7;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs = /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOs;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    return;
  }
}

function isDismissed() {
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return false;
    const elapsed = Date.now() - Number(stored);
    return Number.isFinite(elapsed) && elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setDismissed(isDismissed());
    setInstalled(isStandalone());
    setIos(isIos() && !isStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };

    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
      dismiss();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (pathname === "/") return null;
  if (installed || dismissed) return null;
  if (!prompt && !ios) return null;

  const close = () => {
    setDismissed(true);
    dismiss();
  };

  const install = async () => {
    if (!prompt) return;
    setPrompt(null);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome !== "accepted") close();
  };

  return (
    <div className="safe-bottom fixed inset-x-3 bottom-20 z-[160] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-96">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <Download size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Instalar o Conectado em Concursos</p>

            {ios ? (
              <div className="mt-1 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                <p className="flex items-center gap-1.5">
                  <Share size={13} /> Toque em <strong className="font-medium text-slate-900 dark:text-slate-100">Compartilhar</strong>
                </p>
                <p className="flex items-center gap-1.5">
                  <Square size={13} /> Escolha{" "}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    Adicionar à Tela de Início
                  </strong>
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Acesse o app direto da tela inicial, com navegação mais rápida e
                funcionando mesmo quando a internet estiver lenta.
              </p>
            )}
          </div>

          <button
            type="button"
            aria-label="Dispensar"
            onClick={close}
            className="shrink-0 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        {prompt ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={install}
              className="h-9 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:scale-[0.98]"
            >
              Instalar
            </button>
            <button
              type="button"
              onClick={close}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Agora não
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
