"use client";

import { useState } from "react";

type Props = {
  question: string;
  answer: string;
};

export default function FAQItem({ question, answer }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {question}
        </span>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-base font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200"
          aria-hidden="true"
        >
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="px-5 pb-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {answer}
        </div>
      ) : null}
    </div>
  );
}
