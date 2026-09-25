import { Lightbulb } from "lucide-react";

import { QuestionContent } from "@/components/QuestionContent";

type Props = { text: string | null | undefined };

export function Explanation({ text }: Props) {
  if (!text || !text.trim()) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
        <Lightbulb size={15} /> Explicação
      </div>
      <QuestionContent
        text={text}
        className="text-sm leading-relaxed text-slate-700 dark:text-slate-200"
      />
    </div>
  );
}