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
  official_url: string;
  banca_name: string|null;
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

export type ConcursoResource = {has_file?:boolean;file_name?:string;file_size?:number;id:number;title:string;kind:string;kind_label:string;description:string;url:string;exam_id:number|null;exam_title:string|null};
export type ConcursoDetail = Concurso & {description:string;body:string;resources:ConcursoResource[];exams:import("@/lib/exams").Exam[]};
export async function getConcurso(id:number){return (await http.get<ConcursoDetail>(`/api/concursos/${id}/`)).data;}
