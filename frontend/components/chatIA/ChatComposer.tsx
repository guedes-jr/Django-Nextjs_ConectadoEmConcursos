"use client";

import { useState } from "react";

export function ChatComposer({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");

  const send = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Digite sua mensagem... (ex: 'me ajude a estudar português')"
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          onClick={send}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 text-sm font-medium"
          type="button"
        >
          Enviar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSend("Gere um resumo das minhas estatísticas.")}
          className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Resumo de estatísticas
        </button>
        <button
          type="button"
          onClick={() => onSend("Monte um plano de estudos para 7 dias.")}
          className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Plano de 7 dias
        </button>
        <button
          type="button"
          onClick={() => onSend("Crie um simulado rápido com 10 questões.")}
          className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Simulado rápido
        </button>
      </div>
    </div>
  );
}
