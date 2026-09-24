"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, UsersRound } from "lucide-react";

import { listPeople, type Person } from "@/lib/workspace";

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "U";
}

export default function PeoplePage() {
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await listPeople(search.trim());
        if (active) setPeople(result);
      } catch {
        if (active) setError("Não foi possível carregar as pessoas.");
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <UsersRound className="text-blue-600" /> Pessoas
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Encontre outros candidatos estudando para os mesmos concursos.
          </p>
        </header>

        <section className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou usuário..."
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : people.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <UsersRound className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Nenhuma pessoa encontrada{search.trim() ? ` para “${search.trim()}”` : ""}.
            </p>
          </section>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((person) => (
              <article
                key={person.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <Link
                  href={`/profile/${encodeURIComponent(person.username)}`}
                  className="flex items-center gap-3"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 text-base font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                    {initial(person.name || person.username)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      {person.name || person.username}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{person.username}</p>
                  </div>
                </Link>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
