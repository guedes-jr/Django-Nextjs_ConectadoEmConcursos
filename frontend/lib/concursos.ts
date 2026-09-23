import { http } from "@/lib/http";


export type ConcursoStatus = "open" | "expected" | "closed";

export type Concurso = {
  id: number;
  title: string;
  organization: string;
  headline: string;
  roles: string[];
  levels: string[];
  state: string;
  region: string;
  status: ConcursoStatus;
  deadline: string | null;
  source_url: string;
  source: string;
  vacancies: number | null;
  max_salary: number | null;
};

export type ConcursoResult = {
  count: number;
  results: Concurso[];
  facets?: {
    states: { state: string; count: number }[];
    regions: { region: string; count: number }[];
    areas: { area: string; label: string; count: number }[];
    statuses: { status: string; count: number }[];
    total: number;
  } | null;
};

export type ConcursoFilters = {
  state?: string;
  status?: string;
  region?: string;
  area?: string;
  search?: string;
  role?: string;
  limit?: number;
  offset?: number;
  facets?: boolean;
};

export async function listConcursos(filters: ConcursoFilters = {}) {
  const response = await http.get<ConcursoResult>("/api/concursos/", {
    params: { ...filters, facets: filters.facets ? "1" : undefined },
  });
  return response.data;
}