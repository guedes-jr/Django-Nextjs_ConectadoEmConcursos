import { http } from "@/lib/http";
import type { Question } from "@/lib/questions";

export type SimulationAnswer = {
  question_id: number;
  selected_answer: number;
  correct_answer: number;
  is_correct: boolean;
};

export type SimulationRun = {
  id: number;
  score: number;
  total: number;
  created_at: string;
  answers: SimulationAnswer[];
};

export async function listSimulations() {
  const response = await http.get<SimulationRun[]>("/api/workspace/simulations/");
  return response.data;
}

export async function getQuestionDetails(questionId: number) {
  const response = await http.get<Question>(`/api/questions/${questionId}/`);
  return response.data;
}