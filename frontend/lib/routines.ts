import { http } from "@/lib/http";

export type Schedule = { id: number; routine: string; name: string; enabled: boolean; frequency: "interval" | "daily"; interval_minutes: number; time_of_day: string; timezone_name: string; next_run_at: string; updated_at: string };
export type ScheduleInput = Omit<Schedule, "id" | "next_run_at" | "updated_at">;
export type RoutineCatalog = { id: string; title: string; last_tick_at: string | null; executor_active: boolean };
export type RoutineSettings = { results: Schedule[]; catalog: RoutineCatalog[]; timezones: string[]; can_view_logs: boolean };
export type RoutineExecution = { id: number; schedule_id: number; schedule_name: string; routine: string; scheduled_for: string; started_at: string; finished_at: string | null; status: "running" | "success" | "error" | "interrupted"; duration_ms: number | null; log_truncated: boolean; log?: string };
export type ExecutionList = { count: number; results: RoutineExecution[]; summary: Record<RoutineExecution["status"], number>; can_view_logs: boolean };
export const routines = {
  settings: async () => (await http.get<RoutineSettings>("/api/backoffice/routines/")).data,
  save: async (data: ScheduleInput, id?: number) => (id ? await http.put<Schedule>(`/api/backoffice/routines/${id}/`, data) : await http.post<Schedule>("/api/backoffice/routines/", data)).data,
  executions: async (query: { routine: string; status: string; page: number }) => (await http.get<ExecutionList>("/api/backoffice/routine-executions/", { params: query })).data,
  execution: async (id: number) => (await http.get<RoutineExecution>(`/api/backoffice/routine-executions/${id}/`)).data,
};
