"use client";

import { BillingCycle } from "@/types/plans";

type Props = {
  value: BillingCycle;
  onChange: (v: BillingCycle) => void;
};

export default function BillingToggle({ value, onChange }: Props) {
  const items: Array<{
    key: BillingCycle;
    label: string;
    pill?: { label: string; tone: "orange" | "green" };
  }> = [
    { key: "mensal", label: "Mensal", pill: { label: "Popular", tone: "orange" } },
    { key: "semestral", label: "Semestral", pill: { label: "Economize", tone: "green" } },
    { key: "anual", label: "Anual", pill: { label: "Mais desconto", tone: "green" } },
  ];

  return (
    <div className="mt-6 flex w-full justify-center">
      <div className="relative rounded-xl bg-white/70 p-1 shadow-sm ring-1 ring-slate-200 backdrop-blur dark:bg-slate-900/60 dark:ring-slate-800">
        <div className="grid grid-cols-3 gap-1">
          {items.map((it) => {
            const active = it.key === value;

            return (
              <button
                key={it.key}
                type="button"
                onClick={() => onChange(it.key)}
                className={[
                  "relative rounded-lg px-5 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-50 dark:ring-slate-800"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50",
                ].join(" ")}
              >
                {it.label}
                {it.pill ? (
                  <span
                    className={[
                      "absolute -top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm",
                      it.pill.tone === "orange"
                        ? "bg-orange-500 text-white"
                        : "bg-emerald-500 text-white",
                    ].join(" ")}
                  >
                    {it.pill.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
