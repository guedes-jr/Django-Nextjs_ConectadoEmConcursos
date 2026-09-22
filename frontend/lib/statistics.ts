import { http } from "@/lib/http";

export type DailyPerformance = { date: string; total: number; correct: number; accuracy: number };
export type DisciplinePerformance = { discipline: string; total: number; correct: number; accuracy: number };
export type RecentActivity = { id: number; date: string; question_id: number; discipline: string; is_correct: boolean };
export type Statistics = {
  today_total: number; total: number; correct: number; accuracy: number; streak: number;
  last_30_total: number; last_30_correct: number; last_30_accuracy: number;
  daily: DailyPerformance[]; disciplines: DisciplinePerformance[]; recent_activity: RecentActivity[];
};

export async function getStatistics() {
  const response = await http.get<Statistics>("/api/statistics/");
  return response.data;
}
