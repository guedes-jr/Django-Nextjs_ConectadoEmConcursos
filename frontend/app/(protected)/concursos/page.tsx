"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ExternalLink,
  Search,
  Users,
  Wallet,
} from "lucide-react";

import { Concurso, ConcursoStatus, listConcursos } from "@/lib/concursos";
import { buildPageList } from "@/lib/pagination";

const PAGE_SIZE = 20;

const statusLabels: Record<ConcursoStatus, string> = {
  open: "Inscrições abertas",
  expected: "Previsto",
  closed: "Encerrado",
};

const statusStyles: Record<ConcursoStatus, string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  expected: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG",
  "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR",
  "RS", "SC", "SE", "SP", "TO",
];

const REGION_ORDER = ["NORDESTE", "NORTE", "CENTRO-OESTE", "SUDESTE", "SUL", "Nacional"];

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("pt-BR");
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const deadline = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
}

function formatSalary(value: number | null) {
  if (value == null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}


export default function ConcursosPage() {
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  const [total, setTotal] = useState(0);
  const [available, setAvailable] = useState<{ states: Set<string>; regions: Set<string>; areas: { key: string; label: string }[] }>(
    { states: new Set(), regions: new Set(), areas: [] },
  );
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [region, setRegion] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const resultsRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const offset = (targetPage - 1) * PAGE_SIZE;
      const data = await listConcursos({
        search: search || undefined,
        status: status || undefined,
        state: state || undefined,
        region: region || undefined,
        area: area || undefined,
        limit: PAGE_SIZE,
        offset,
        facets: offset === 0,
      });
      setConcursos(data.results);
      setTotal(data.count);
      setPage(targetPage);
      if (data.facets) {
        setAvailable({
          states: new Set(data.facets.states.map((item) => item.state)),
          regions: new Set(data.facets.regions.map((item) => item.region)),
          areas: data.facets.areas.map((item) => ({ key: item.area, label: item.label })),
        });
      }
    } catch {
      setError("Não foi possível carregar os concursos.");
    } finally {
      setLoading(false);
    }
  }, [search, state, region, area, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (targetPage: number) => {
    if (targetPage === page || targetPage < 1 || targetPage > totalPages) return;
    void load(targetPage);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pageNumbers = useMemo(
    () => buildPageList(page, totalPages),
    [page, totalPages],
  );

  const states = useMemo(
    () => UFS.filter((uf) => available.states.has(uf)),
    [available],
  );

  const regions = useMemo(
    () => REGION_ORDER.filter((regionName) => available.regions.has(regionName)),
    [available],
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Concursos públicos com inscrições abertas
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Concursos de todo o Brasil reunidos e atualizados diariamente. Confirme sempre os detalhes no edital oficial.
            </p>
          </header>

          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <label className="relative">
              <span className="sr-only">Buscar concurso</span>
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por órgão ou cargo (ex.: prefeitura, professor)"
                className="h-10 w-full rounded-lg border border-slate-300 bg-transparent pl-9 pr-3 text-sm dark:border-slate-700 dark:text-slate-100"
              />
            </label>
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              aria-label="Região"
              className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as regiões</option>
              {regions.map((regionName) => <option key={regionName} value={regionName}>{regionName}</option>)}
            </select>
            <select
              value={state}
              onChange={(event) => setState(event.target.value)}
              aria-label="Estado"
              className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todos os estados</option>
              {states.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            <select
              value={area}
              onChange={(event) => setArea(event.target.value)}
              aria-label="Área"
              className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as áreas</option>
              {available.areas.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Situação"
              className="h-10 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as situações</option>
              <option value="open">Inscrições abertas</option>
              <option value="expected">Previsto</option>
              <option value="closed">Encerrado</option>
            </select>
          </section>

          {!loading && !error && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {total} {total === 1 ? "concurso encontrado" : "concursos encontrados"}
            </p>
          )}

          {loading && <p className="text-slate-500 dark:text-slate-400">Carregando concursos…</p>}
          {error && <p className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

          <section ref={resultsRef} className="scroll-mt-24 space-y-3">
            {concursos.map((item) => {
              const days = daysUntil(item.deadline);
              return (
                <article
                  key={`${item.source}-${item.id}`}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700 md:flex-row md:items-start md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>
                        {statusLabels[item.status]}
                      </span>
                      {item.state && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {item.state}
                        </span>
                      )}
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {item.region}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                      <Building2 size={15} />
                      {item.organization}
                    </p>
                    {item.headline && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                        {item.vacancies != null && (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 font-semibold dark:bg-emerald-950">
                            <Users size={13} /> {item.vacancies} {item.vacancies === 1 ? "vaga" : "vagas"}
                          </span>
                        )}
                        {formatSalary(item.max_salary) && (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 font-semibold dark:bg-emerald-950">
                            <Wallet size={13} /> até {formatSalary(item.max_salary)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.roles.map((role) => (
                        <span key={role} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{role}</span>
                      ))}
                      {item.levels.map((level) => (
                        <span key={level} className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{level}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
                    {item.deadline && (
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                        <CalendarDays size={15} />
                        <span>Inscrições até {formatDate(item.deadline)}</span>
                      </div>
                    )}
                    {item.deadline && item.status === "open" && days != null && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${days < 0 ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" : days <= 7 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                        {days < 0 ? "Prazo encerrado" : days === 0 ? "Encerra hoje" : `${days} ${days === 1 ? "dia" : "dias"} restantes`}
                      </span>
                    )}
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Ver edital <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
            {!loading && !error && concursos.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">
                Nenhum concurso encontrado com os filtros atuais.
              </p>
            )}
          </section>

          {totalPages > 1 && !loading && (
            <nav aria-label="Paginação" className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
              >
                <ArrowLeft size={15} /> Anterior
              </button>
              {pageNumbers.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="px-2 py-2 text-slate-400">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => goToPage(item)}
                    aria-current={item === page ? "page" : undefined}
                    className={`min-w-9 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      item === page
                        ? "bg-blue-600 text-white"
                        : "bg-white text-blue-600 ring-1 ring-slate-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-600 ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
              >
                Próxima <ArrowRight size={15} />
              </button>
            </nav>
          )}
          {totalPages > 1 && (
            <p className="text-center text-xs text-slate-400">
              Página {page} de {totalPages} · {total} concursos
            </p>
          )}

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-900 dark:bg-blue-950/40">
            <BookOpen className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Estude para a aprovação</h3>
            <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-300">
              Questões, provas anteriores e planejamento de estudos para você treinar exatamente o que cai na prova.
            </p>
            <Link
              href="/questions"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Ir para questões <ArrowRight size={15} />
            </Link>
          </section>
      </div>
    </main>
  );
}