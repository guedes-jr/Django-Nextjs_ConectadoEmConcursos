import { http } from "@/lib/http";

export type PlanKind = "trilha" | "cronograma" | "ciclo";
export type StudyBlockKind = "theory" | "questions" | "review";
export type StudyBlock = {
  id: number;
  date: string;
  discipline: string;
  kind: StudyBlockKind;
  planned_minutes: number;
  actual_minutes: number;
  answered_questions: number;
  status: "pending" | "done" | "skipped";
  position: number;
  cycle_index: number | null;
};
export type StudyInterval = {
  id: number;
  plan_id: number | null;
  kind: "focus" | "break";
  minutes: number;
  started_at: string;
};
export type StudyPlan = {
  id: number;
  kind: PlanKind;
  title: string;
  goal: string;
  exam_date: string | null;
  disciplines: string[];
  weekdays: number[];
  minutes_per_day: number;
  schedule: { weekday: number; disciplines: string[]; minutes: number }[];
  cycle: { discipline: string; minutes: number; kind: StudyBlockKind }[];
  reminder_enabled: boolean;
  reminder_time: string | null;
  active: boolean;
  week_start: string;
  blocks: StudyBlock[];
  review_due: number;
  today_cycle: { discipline: string; minutes: number; kind: StudyBlockKind; cycle_index: number | null; status: string }[];
  cycle_index: number;
  weekly_answers: number;
  weekly_correct: number;
  weekly_completed: number;
  weekly_planned: number;
  discipline_stats: {
    discipline: string;
    planned_minutes: number;
    actual_minutes: number;
    completed: number;
    total: number;
    answered: number;
    correct: number;
  }[];
};
export type PlanSummary = {
  id: number;
  kind: PlanKind;
  title: string;
  goal: string;
  exam_date: string | null;
  disciplines: string[];
  weekdays: number[];
  minutes_per_day: number;
  active: boolean;
  created_at: string;
  weekly_completed: number;
  weekly_planned: number;
  blocks_today: number;
};
export type PlanInput = {
  kind: PlanKind;
  title?: string;
  goal: string;
  exam_date: string | null;
  disciplines: string[];
  weekdays: number[];
  minutes_per_day: number;
  schedule?: { weekday: number; disciplines: string[]; minutes: number }[];
  cycle?: { discipline: string; minutes: number; kind: StudyBlockKind }[];
  reminder_enabled?: boolean;
  reminder_time?: string | null;
};
export type StudyAlerts = {
  blocks_today: number;
  reviews_due: number;
  exam_in_days: number | null;
  reminder_time: string | null;
  plans: number;
};

const BLOCK_URL = (planId: number) => `/api/study-plans/${planId}/blocks`;

export async function getStudyPlans() {
  const response = await http.get<PlanSummary[]>("/api/study-plans/");
  return response.data;
}
export async function getStudyPlan(id: number, week = 0) {
  const response = await http.get<StudyPlan>(`/api/study-plans/${id}/`, { params: { week } });
  return response.data;
}
export async function createStudyPlan(input: PlanInput) {
  const response = await http.post<StudyPlan>("/api/study-plans/", input);
  return response.data;
}
export async function updateStudyPlan(id: number, input: PlanInput) {
  const response = await http.patch<StudyPlan>(`/api/study-plans/${id}/`, input);
  return response.data;
}
export async function deleteStudyPlan(id: number) {
  await http.delete(`/api/study-plans/${id}/`);
}
export async function updateStudyBlock(
  planId: number,
  id: number,
  data: Partial<Pick<StudyBlock, "date" | "status" | "planned_minutes">>,
) {
  const response = await http.patch<Pick<StudyBlock, "id" | "status" | "date" | "planned_minutes">>(
    `${BLOCK_URL(planId)}/${id}/`,
    data,
  );
  return response.data;
}
export async function recordStudySession(planId: number, id: number, minutes: number) {
  const response = await http.post<{ status: string; actual_minutes: number }>(
    `${BLOCK_URL(planId)}/${id}/sessions/`,
    { minutes },
  );
  return response.data;
}
export async function replanStudy(planId: number) {
  const response = await http.post<{ rescheduled: number; plan: StudyPlan }>(`/api/study-plans/${planId}/replan/`);
  return response.data;
}
export async function getStudyAlerts() {
  const response = await http.get<StudyAlerts>("/api/study-alerts/");
  return response.data;
}
export async function listIntervals() {
  const response = await http.get<StudyInterval[]>("/api/study-intervals/");
  return response.data;
}
export async function createInterval(data: { plan_id?: number; kind: "focus" | "break"; minutes: number }) {
  const response = await http.post<StudyInterval>("/api/study-intervals/", data);
  return response.data;
}

export const KIND_LABELS: Record<PlanKind, string> = {
  trilha: "Trilha semanal",
  cronograma: "Cronograma de Estudos",
  ciclo: "Ciclo de Estudos",
};
export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const BLOCK_KIND_LABELS: Record<StudyBlockKind, string> = {
  theory: "Teoria",
  questions: "Questões",
  review: "Revisão",
};