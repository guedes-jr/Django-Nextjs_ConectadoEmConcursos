"use client";

import { QuestionContent } from "@/components/QuestionContent";

type Text = {id:number;title:string;content:string;reference:string};
export function SupportTextPanel({text}:{text?:Text|null}) {
  if (!text) return null;
  return <details key={text.id} className="mb-4 min-w-0 rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
    <summary className="min-h-11 cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-200">Texto de apoio: {text.title} <span className="font-normal">(expandir/recolher)</span></summary>
    <div className="space-y-3 border-t border-blue-100 p-4 leading-7 dark:border-blue-900"><QuestionContent text={text.content}/>{text.reference&&<p className="break-words text-xs text-slate-500">Referência: {text.reference}</p>}</div>
  </details>;
}
