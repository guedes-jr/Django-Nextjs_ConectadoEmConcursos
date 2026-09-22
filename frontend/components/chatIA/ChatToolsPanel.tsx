"use client";

import { useMemo, useState } from "react";
import { mockExams } from "@/lib/mocks/exams";
import { mockQuestions } from "@/lib/mocks/questions";
import { ChatToolModal } from "./ChatToolModal";

export type ToolAction =
  | { type: "mention_exam"; examId: number }
  | { type: "mention_question"; questionId: number }
  | { type: "stats_summary" }
  | { type: "study_plan" };

export function ChatToolsPanel({ onAction }: { onAction: (a: ToolAction) => void }) {
  const [openExams, setOpenExams] = useState(false);
  const [openQuestions, setOpenQuestions] = useState(false);

  const [examSearch, setExamSearch] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");

  const exams = useMemo(() => {
    const t = examSearch.trim().toLowerCase();
    if (!t) return mockExams;
    return mockExams.filter((e) =>
      `${e.banca} ${e.title} ${e.year}`.toLowerCase().includes(t)
    );
  }, [examSearch]);

  const questions = useMemo(() => {
    const t = questionSearch.trim().toLowerCase();
    if (!t) return mockQuestions;
    return mockQuestions.filter((q) =>
      `${q.banca} ${q.discipline} ${q.statement} ${q.year}`.toLowerCase().includes(t)
    );
  }, [questionSearch]);

  return (
    <>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ferramentas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Use as ferramentas para dar contexto ao chat.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onAction({ type: "stats_summary" })}
            className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Resumo do usuário
          </button>

          <button
            type="button"
            onClick={() => onAction({ type: "study_plan" })}
            className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Plano de estudos
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Provas
          </div>
          <button
            type="button"
            onClick={() => setOpenExams(true)}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium"
          >
            Selecionar Prova
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Escolha uma prova para o chat considerar como contexto.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Questões
          </div>
          <button
            type="button"
            onClick={() => setOpenQuestions(true)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Selecionar Questão
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Escolha uma questão para pedir explicação, resolução ou resumo.
          </p>
        </div>
      </div>

      <ChatToolModal
        open={openExams}
        title="Selecionar Prova"
        description="Busque e selecione uma prova para mencionar no chat."
        onClose={() => setOpenExams(false)}
      >
        <div className="space-y-3">
          <input
            value={examSearch}
            onChange={(e) => setExamSearch(e.target.value)}
            placeholder="Buscar prova..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
          />

          <div className="space-y-2">
            {exams.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onAction({ type: "mention_exam", examId: e.id });
                  setOpenExams(false);
                }}
                className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {e.banca} - {e.title} - {e.year}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {e.questionsCount} questões
                </div>
              </button>
            ))}

            {exams.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Nenhuma prova encontrada.
              </div>
            ) : null}
          </div>
        </div>
      </ChatToolModal>

      <ChatToolModal
        open={openQuestions}
        title="Selecionar Questão"
        description="Busque e selecione uma questão para mencionar no chat."
        onClose={() => setOpenQuestions(false)}
      >
        <div className="space-y-3">
          <input
            value={questionSearch}
            onChange={(e) => setQuestionSearch(e.target.value)}
            placeholder="Buscar questão..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
          />

          <div className="space-y-2">
            {questions.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  onAction({ type: "mention_question", questionId: q.id });
                  setOpenQuestions(false);
                }}
                className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {q.banca} • {q.discipline} • {q.year}
                </div>
                <div className="text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
                  {q.statement}
                </div>
              </button>
            ))}

            {questions.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Nenhuma questão encontrada.
              </div>
            ) : null}
          </div>
        </div>
      </ChatToolModal>
    </>
  );
}
