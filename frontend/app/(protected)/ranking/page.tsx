"use client";

import { useEffect, useState } from "react";
import { Crown, Loader2, Medal, Target, Trophy } from "lucide-react";

import { listRanking, type RankingEntry } from "@/lib/workspace";

const MEDALS = [
  {
    ring: "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
    badge: "bg-amber-400 text-amber-950",
  },
  {
    ring: "border-slate-300 bg-slate-50 dark:bg-slate-800",
    badge: "bg-slate-300 text-slate-800",
  },
  {
    ring: "border-orange-300 bg-orange-50 dark:bg-orange-950/30",
    badge: "bg-orange-300 text-orange-900",
  },
];

export default function RankingPage() {
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listRanking()
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar o ranking.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <Trophy className="text-blue-600" /> Ranking de Usuários
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Os candidatos mais consistentes da plataforma, pelo total de acertos nas questões.
          </p>
        </header>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : entries.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <Medal className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Nenhum usuário com respostas ainda. Seja a primeira pessoa a subir no pódio!
            </p>
          </section>
        ) : (
          <section className="space-y-3">
            {entries.map((entry) => {
              const medal = entry.position <= MEDALS.length ? MEDALS[entry.position - 1] : null;
              const accuracy = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
              return (
                <article
                  key={entry.username}
                  className={`flex items-center gap-4 rounded-2xl border bg-white p-4 dark:bg-slate-900 ${
                    medal ? `${medal.ring} border-2` : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="w-8 shrink-0 text-center">
                    {entry.position === 1 ? (
                      <Crown size={20} className="text-amber-400" aria-label="Primeiro lugar" />
                    ) : (
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          medal
                            ? medal.badge
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {entry.position}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      @{entry.username}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {entry.correct} acertos de {entry.total} · {accuracy}% de aproveitamento
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                    <Target size={14} /> {accuracy}%
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}