"use client";

import { AlertTriangle, Copy } from "lucide-react";
import { QuestionContent } from "@/components/QuestionContent";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { answerLetter, type RejectionReasons, type ReviewQuestion } from "@/lib/content";

type Props = {
  question: ReviewQuestion;
  explanation: string;
  onExplanationChange: (value: string) => void;
  rejectionReasons: RejectionReasons;
  onApprove: () => void;
  onReject: (reasonCode: string, reason: string) => void;
  onSkip: () => void;
  onGoNext: () => void;
  onGoPrevious: () => void;
  busy: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  explanationInvalid?: boolean;
  explanationRef?: React.RefObject<HTMLTextAreaElement | null>;
  reasonsRef?: React.RefObject<HTMLDivElement | null>;
  reasonsInvalid?: boolean;
};

export function ReviewPanel({
  question,
  explanation,
  onExplanationChange,
  rejectionReasons,
  onApprove,
  onReject,
  onSkip,
  onGoNext,
  onGoPrevious,
  busy,
  hasPrevious,
  hasNext,
  explanationInvalid = false,
  explanationRef,
  reasonsRef,
  reasonsInvalid = false,
}: Props) {
  const remaining = 120 - explanation.length;
  const conflicts = question.duplicates.filter((item) => item.answer_conflict);
  const isPending = question.status === "pending";
  const canApprove = isPending && explanation.trim().length > 0 && remaining >= 0;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono">#{question.id}</span>
          {question.source && (
            <Badge variant="outline" className="font-normal">
              {question.source.label}
            </Badge>
          )}
          {question.banca && <span>{question.banca}</span>}
          <span>{question.discipline}</span>
          <span>{question.year}</span>
          {question.number !== null && <span>questão {question.number}</span>}
          {question.external_id && <span className="font-mono">{question.external_id}</span>}
        </div>
        {question.source?.attribution && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {question.source.attribution}
          </p>
        )}
        {question.source_url && (
          <a
            href={question.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
          >
            Ver na origem
          </a>
        )}
      </header>

      {conflicts.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Conflito de gabarito com {conflicts.length}{" "}
            {conflicts.length === 1 ? "questão parecida" : "questões parecidas"}.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {conflicts.map((match) => (
              <li key={match.id}>
                <a href={`/admin/fila-questoes?questao=${match.id}`} className="font-mono underline">
                  #{match.id}
                </a>{" "}
                — {match.percent}% igual, gabarito {answerLetter(question.correct_answer)} nesta questão
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <QuestionContent text={question.statement} className="text-sm leading-relaxed text-slate-800 dark:text-slate-100" />
        <ul className="mt-4 space-y-2">
          {question.options.map((option, index) => {
            const correct = index === question.correct_answer;
            return (
              <li
                key={`${index}-${option}`}
                className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${
                  correct
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="font-semibold">{answerLetter(index)}</span>
                <QuestionContent text={option} className="min-w-0 flex-1" />
                {correct && <span className="text-xs font-semibold uppercase">gabarito</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {question.duplicates.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Parecidas ({question.duplicates.length})
          </p>
          <ul className="space-y-1 text-xs">
            {question.duplicates.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                <a href={`/admin/fila-questoes?questao=${match.id}`} className="font-mono underline">
                  #{match.id}
                </a>
                <span>{match.percent}%</span>
                {match.exact && <Badge variant="outline">idêntica</Badge>}
                {match.answer_conflict && (
                  <Badge className="bg-rose-600 text-white hover:bg-rose-600">gabarito diferente</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="explanation" className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Comentário da questão
            </label>
            <Textarea
              id="explanation"
              ref={explanationRef}
              aria-invalid={explanationInvalid}
              className={explanationInvalid ? "border-rose-500 focus-visible:ring-rose-500" : undefined}
              value={explanation}
              maxLength={120}
              rows={3}
              placeholder="Explica o gabarito em uma ou duas frases."
              onChange={(event) => onExplanationChange(event.target.value)}
            />
            <p className={`text-xs ${remaining < 0 ? "text-rose-600" : "text-slate-500 dark:text-slate-400"}`}>
              {explanation.length}/120
            </p>
          </div>

          <div
            ref={reasonsRef}
            tabIndex={-1}
            className={`space-y-2 rounded-lg ${reasonsInvalid ? "p-2 ring-2 ring-rose-500" : ""}`}
          >
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Rejeitar como</p>
            <div className="flex flex-wrap gap-2">
              {rejectionReasons.map((reason) => (
                <Button
                  key={reason.code}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onReject(reason.code, reason.label)}
                >
                  {reason.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <Button disabled={busy || !canApprove} onClick={onApprove}>
              Aprovar <kbd className="ml-1 text-[10px] opacity-70">A</kbd>
            </Button>
            <Button variant="ghost" disabled={busy || !hasPrevious} onClick={onSkip}>
              Pular <kbd className="ml-1 text-[10px] opacity-70">S</kbd>
            </Button>
            <Button variant="ghost" disabled={busy || !hasNext} onClick={onGoNext}>
              Próxima <kbd className="ml-1 text-[10px] opacity-70">J</kbd>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {question.status === "approved"
              ? `Aprovada${question.reviewed_by ? ` por ${question.reviewed_by}` : ""}.`
              : `Rejeitada (${question.rejection_reason_code || question.rejection_reason || "sem motivo"}).`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={busy || !hasPrevious} onClick={onGoPrevious}>
              Anterior <kbd className="ml-1 text-[10px] opacity-70">K</kbd>
            </Button>
            <Button variant="outline" disabled={busy || !hasNext} onClick={onGoNext}>
              Próxima <kbd className="ml-1 text-[10px] opacity-70">J</kbd>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(question.statement)}>
              <Copy className="h-4 w-4" /> Copiar enunciado
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
