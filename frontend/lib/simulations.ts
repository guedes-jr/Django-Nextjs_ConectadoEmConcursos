import { http } from "@/lib/http";
import type { Question, SimulationResult } from "@/lib/questions";

export type SimulationAnswer = {
  question_id: number;
  selected_answer: number;
  correct_answer: number;
  is_correct: boolean;
};

export type SimulationRunStatus = "in_progress" | "finished" | "expired";

export type SimulationRun = {
  id: number;
  score: number;
  total: number;
  created_at: string;
  answers: SimulationAnswer[];
  status: SimulationRunStatus;
  question_count: number;
  discipline: string;
  banca: string;
  year: number | null;
  exam_ids: number[];
  time_limit_minutes: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  finished_at: string | null;
};

export type SimulationConfig = {
  discipline?: string;
  exam_ids: number[];
  banca?: string;
  year?: number | null;
  count?: number | null;
  full_exam?: boolean;
  time_limit_minutes?: number | null;
};

export type SimulationQuestion = {
  id: number;
  exam_id: number | null;
  exam_title: string;
  exam_role: string;
  exam_institution: string;
  discipline: string;
  banca: string;
  year: number;
  statement: string;
  options: string[];
};

export type SimulationSession = {
  simulation_id: number;
  started_at: string;
  time_limit_minutes: number | null;
  question_count: number;
  questions: SimulationQuestion[];
};

export type SimulationTemplate = {
  id: number;
  name: string;
  discipline: string;
  exam_ids: number[];
  banca: string;
  year: number | null;
  count: number | null;
  full_exam: boolean;
  time_limit_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export async function listSimulations() {
  const response = await http.get<SimulationRun[]>("/api/workspace/simulations/");
  return response.data;
}

export async function startSimulation(config: SimulationConfig) {
  const response = await http.post<SimulationSession>("/api/questions/simulations/start/", {
    discipline: config.discipline || undefined,
    exam_ids: config.exam_ids,
    banca: config.banca || undefined,
    year: config.year ?? undefined,
    count: config.full_exam ? undefined : config.count,
    full_exam: Boolean(config.full_exam),
    time_limit_minutes: config.time_limit_minutes ?? undefined,
  });
  return response.data;
}

export async function submitSimulationSession(
  simulationId: number,
  answers: { question_id: number; selected_answer: number }[],
) {
  const response = await http.post<{ results: SimulationResult[] }>(
    "/api/questions/submit-simulation/",
    { simulation_id: simulationId, answers },
  );
  return response.data.results;
}

export async function listSimulationTemplates() {
  const response = await http.get<SimulationTemplate[]>("/api/simulation-templates/");
  return response.data;
}

export async function createSimulationTemplate(
  payload: Omit<SimulationTemplate, "id" | "created_at" | "updated_at">,
) {
  const response = await http.post<SimulationTemplate>("/api/simulation-templates/", payload);
  return response.data;
}

export async function deleteSimulationTemplate(id: number) {
  await http.delete(`/api/simulation-templates/${id}/`);
}

export async function getQuestionDetails(questionId: number) {
  const response = await http.get<Question>(`/api/questions/${questionId}/`);
  return response.data;
}