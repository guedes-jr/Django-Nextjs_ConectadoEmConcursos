"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, Search } from "lucide-react";

import { Exam, listExams } from "@/lib/exams";


export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [search, setSearch] = useState("");
  const [banca, setBanca] = useState("");
  const [year, setYear] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setExams(await listExams({
        search: search || undefined,
        banca: banca || undefined,
        year: year || undefined,
        discipline: discipline || undefined,
      }));
    } catch {
      setError("Não foi possível carregar as provas.");
    } finally {
      setLoading(false);
    }
  }, [banca, discipline, search, year]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const facets = useMemo(() => ({
    bancas: [...new Set(exams.map((exam) => exam.banca))].sort(),
    years: [...new Set(exams.map((exam) => exam.year))].sort((a, b) => b - a),
    disciplines: [...new Set(exams.flatMap((exam) => exam.disciplines))].sort(),
  }), [exams]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Provas de concursos públicos</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Encontre uma prova e acesse somente as questões vinculadas a ela.</p>
        </header>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2 lg:grid-cols-5">
          <label className="relative md:col-span-2">
            <span className="sr-only">Buscar prova</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar prova, instituição ou cargo" className="h-10 w-full rounded-lg border border-slate-300 bg-transparent pl-9 pr-3 text-sm dark:border-slate-700" />
          </label>
          <select value={banca} onChange={(event) => setBanca(event.target.value)} aria-label="Banca" className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700"><option value="">Todas as bancas</option>{facets.bancas.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="Ano" className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700"><option value="">Todos os anos</option>{facets.years.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={discipline} onChange={(event) => setDiscipline(event.target.value)} aria-label="Disciplina" className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700"><option value="">Todas as disciplinas</option>{facets.disciplines.map((item) => <option key={item}>{item}</option>)}</select>
        </section>

        {loading && <p className="text-slate-500">Carregando provas…</p>}
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}

        <section className="space-y-3">
          {exams.map((exam) => (
            <Link key={exam.id} href={`/questions?exam=${exam.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/30">
              <div className="flex min-w-0 items-start gap-4">
                <div className="rounded-xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><BookOpen className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">{exam.banca} — {exam.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{exam.institution || "Instituição não informada"} · {exam.role || "Cargo não informado"} · {exam.year}</p>
                  <div className="mt-2 flex flex-wrap gap-2">{exam.disciplines.map((item) => <span key={item} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item}</span>)}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm text-slate-500"><span>{exam.question_count} questões</span><ChevronRight className="h-5 w-5" /></div>
            </Link>
          ))}
          {!loading && !error && exams.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">Nenhuma prova encontrada.</p>}
        </section>
      </div>
    </main>
  );
}
