import { http } from "@/lib/http";

export type DailyPerformance = { date: string; total: number; correct: number; accuracy: number };
export type DisciplinePerformance = { discipline: string; total: number; correct: number; incorrect: number; accuracy: number };
export type BancaPerformance = { banca: string; total: number; correct: number; incorrect: number; accuracy: number };
export type RecentActivity = {
  id: number;
  date: string;
  question_id: number;
  discipline: string;
  banca: string;
  is_correct: boolean;
};
export type StatisticsFilters = {
  start_date?: string;
  end_date?: string;
  discipline?: string;
  banca?: string;
};
export type Statistics = {
  today_total: number; total: number; correct: number; incorrect: number; accuracy: number; streak: number;
  last_30_total: number; last_30_correct: number; last_30_accuracy: number;
  daily: DailyPerformance[]; disciplines: DisciplinePerformance[]; bancas: BancaPerformance[];
  recent_activity: RecentActivity[]; filters: StatisticsFilters;
};

export async function getStatistics(filters: StatisticsFilters = {}) {
  const response = await http.get<Statistics>("/api/statistics/", { params: filters });
  return response.data;
}
