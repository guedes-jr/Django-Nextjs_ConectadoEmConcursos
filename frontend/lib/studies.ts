import { http } from "@/lib/http";

export type StudyKind = "theory" | "questions" | "review";
export type StudyBlock = {
  id: number; date: string; discipline: string; kind: StudyKind;
  planned_minutes: number; actual_minutes: number; answered_questions: number;
  status: "pending" | "done" | "skipped"; position: number;
};
export type StudyPlan = {
  id: number; goal: string; exam_date: string | null; disciplines: string[];
  weekdays: number[]; minutes_per_day: number; week_start: string;
  blocks: StudyBlock[]; review_due: number; weekly_answers: number;
  weekly_correct: number; weekly_completed: number; weekly_planned: number;
  discipline_stats: { discipline: string; planned_minutes: number; actual_minutes: number; completed: number; total: number; answered: number; correct: number }[];
};
export type PlanInput = Pick<StudyPlan, "goal" | "exam_date" | "disciplines" | "weekdays" | "minutes_per_day">;

export async function getStudyPlan(week = 0) {
  const response = await http.get<StudyPlan | null>("/api/study-plan/", { params: { week } });
  return response.data;
}
export async function saveStudyPlan(input: PlanInput, exists: boolean) {
  const response = exists ? await http.patch<StudyPlan>("/api/study-plan/", input) : await http.post<StudyPlan>("/api/study-plan/", input);
  return response.data;
}
export async function updateStudyBlock(id: number, data: Partial<Pick<StudyBlock, "date" | "status" | "planned_minutes">>) {
  await http.patch(`/api/study-plan/blocks/${id}/`, data);
}
export async function recordStudySession(id: number, minutes: number) {
  await http.post(`/api/study-plan/blocks/${id}/sessions/`, { minutes });
}
export async function replanStudy() {
  const response = await http.post<{ rescheduled: number }>("/api/study-plan/replan/");
  return response.data;
}
