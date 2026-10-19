import { http } from "@/lib/http";


export type Exam = {
  id: number;
  title: string;
  banca: string;
  institution: string;
  role: string;
  year: number;
  level?: string;
  state?: string;
  concurso?: {id:number;title:string;organization:string;official_url:string}|null;
  question_count: number;
  disciplines: string[];
};

export type ExamFilters = {
  search?: string;
  banca?: string;
  year?: string;
  discipline?: string;
};

export async function listExams(filters: ExamFilters = {}) {
  const response = await http.get<Exam[]>("/api/exams/", { params: filters });
  return response.data;
}

export async function getExam(id:number){return (await http.get<Exam>(`/api/exams/${id}/`)).data;}
export async function getExamMaterials(id:number){return (await http.get<{results:import("@/lib/concursos").ConcursoResource[]}>(`/api/exams/${id}/materials/`)).data;}
