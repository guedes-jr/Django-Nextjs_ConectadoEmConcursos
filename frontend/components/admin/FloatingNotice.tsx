"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

type Props = { message: string | null; onDismiss: () => void; };
export function FloatingNotice({ message, onDismiss }: Props) {
  const [remaining, setRemaining] = useState(5);
  useEffect(() => {
    if (!message) return;
    setRemaining(5);
    const interval = window.setInterval(() => setRemaining((seconds) => Math.max(0, seconds - 1)), 1000);
    const timer = window.setTimeout(onDismiss, 5000);
    return () => { window.clearInterval(interval); window.clearTimeout(timer); };
  }, [message, onDismiss]);
  if (!message) return null;
  return <div role="status" className="fixed right-4 top-4 z-[220] flex w-[min(25rem,calc(100vw-2rem))] items-center gap-3 overflow-hidden border border-[#2f5f54] bg-[#3f7667] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(15,23,42,0.22)] transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-3 dark:border-[#5c9b89] dark:bg-[#315f54]"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d7f1e5] text-[#286451] dark:bg-[#d7f1e5] dark:text-[#286451]"><Check className="h-4 w-4" strokeWidth={2.5} /></span><p className="flex-1">{message}</p><button type="button" onClick={onDismiss} className="p-1.5 text-white/75 transition duration-200 hover:bg-white/12 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60" aria-label="Fechar aviso"><X className="h-4 w-4" /></button><span className="pointer-events-none absolute bottom-px left-px right-px h-1 bg-black/12"><span className="block h-full bg-[#b8e3cb] transition-[width] duration-1000 ease-linear" style={{ width: `${remaining * 20}%` }} /></span></div>;
}
