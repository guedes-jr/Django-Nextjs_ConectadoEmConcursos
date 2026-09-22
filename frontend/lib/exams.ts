import { http } from "@/lib/http";


export type Exam = {
  id: number;
  title: string;
  banca: string;
  institution: string;
  role: string;
  year: number;
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
