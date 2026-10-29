"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { QuestionContent } from "@/components/QuestionContent";

type Text = {id:number;title:string;content:string;reference:string};
export function SupportTextPanel({text}:{text?:Text|null}) {
  const [isVisible, setIsVisible] = useState(false);

  if (!text) return null;
  return <section className="mb-4 min-w-0" aria-label={`Texto associado: ${text.title}`}>
    <button
      type="button"
      aria-expanded={isVisible}
      aria-controls={`support-text-${text.id}`}
      onClick={() => setIsVisible((visible) => !visible)}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${isVisible ? "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-100 dark:hover:bg-blue-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"}`}
    >
      <FileText size={18} aria-hidden="true" />
      {isVisible ? "Ocultar texto" : "Exibir texto associado"}
    </button>
    {isVisible && (
      <div id={`support-text-${text.id}`} className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 leading-7 dark:border-blue-900 dark:bg-blue-950/20">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Texto de apoio: {text.title}</p>
        <QuestionContent text={text.content}/>
        {text.reference && <p className="break-words text-xs text-slate-500">Referência: {text.reference}</p>}
      </div>
    )}
  </section>;
}
