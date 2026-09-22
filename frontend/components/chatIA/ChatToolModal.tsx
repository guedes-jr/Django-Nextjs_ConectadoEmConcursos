"use client";

import { ReactNode, useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

export function ChatToolModal({
  open,
  title,
  description,
  onClose,
  footer,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="absolute left-1/2 top-1/2 w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
              {description ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>

          <div className="px-5 py-4 max-h-[65vh] overflow-y-auto">{children}</div>

          {footer ? (
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
