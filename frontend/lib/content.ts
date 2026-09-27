import { http } from "@/lib/http";

/** Cliente da API de conteúdo do admin (`/api/backoffice/content/`). */

export type ContentSource = {
  id: number;
  slug: string;
  label: string;
  kind: string;
  license_name: string;
  license_url: string;
  attribution: string;
  requires_attribution: boolean;
  home_url?: string;
  is_active?: boolean;
  last_sync_at: string | null;
  facets_at: string | null;
};

export type SourceCatalogItem = ContentSource & {
  ready_for_import: boolean;
  availability: "ready" | "missing_license" | "inactive";
  availability_message: string;
  questions_total: number;
  pending_total: number;
  runs_total: number;
};

export type FilterOption = {
  value: string;
  label: string;
  count?: number | null;
};

export type FilterSpec = {
  key: string;
  label: string;
  kind: "select" | "multiselect" | "text" | "int_range" | "bool" | "file";
  param: string;
  options_from: "facets" | "adapter" | "file";
  multiple: boolean;
  required: boolean;
  help_text: string;
  options: FilterOption[];
};

export type SearchRun = {
  id: number;
  name: string;
  source: string;
  filters: Record<string, unknown>;
  fingerprint: string;
  status: "running" | "done" | "partial" | "failed";
  next_page: number | null;
  limit: number;
  counts: Record<string, number>;
  duplicates_preview: Array<{ external_id?: string; match_id?: number; score?: number }>;
  log_path: string;
  parent: number | null;
  started_by: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  questions_count: number | null;
  reviewed_count?: number;
};

export type Duplicate = {
  id: number;
  score: number;
  percent: number;
  exact: boolean;
  answer_conflict: boolean;
};

export type ReviewQuestion = {
  id: number;
  search_run: number | null;
  status: string;
  statement: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  discipline: string;
  banca: string;
  year: number;
  number: number | null;
  exam: string | null;
  external_id: string | null;
  content_hash: string;
  source_url: string;
  source: ContentSource | null;
  review_note: string;
  duplicates: Duplicate[];
  conflict: boolean;
  rejection_reason: string;
  rejection_reason_code: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

export type QueuePage = {
  total: number;
  limit: number;
  offset: number;
  results: ReviewQuestion[];
};

export type QueueFilters = {
  status?: string;
  source?: string;
  search_run?: number;
  banca?: string;
  discipline?: string;
  year?: string;
  search?: string;
  duplicates?: string;
  conflict?: string;
  limit?: number;
  offset?: number;
};

export type RejectionReasons = { code: string; label: string }[];

const BASE = "/api/backoffice/content";

export const content = {
  sources: () => http.get<{ results: ContentSource[] }>(`${BASE}/sources/`).then((r) => r.data.results),

  sourceCatalog: () => http.get<{ results: SourceCatalogItem[] }>(`${BASE}/sources/catalog/`).then((r) => r.data.results),

  sourceFilters: (slug: string, current: Record<string, unknown> = {}) =>
    http
      .get<{ source: ContentSource; filters: FilterSpec[] }>(`${BASE}/sources/${slug}/filters/`, {
        params: { current: JSON.stringify(current) },
      })
      .then((r) => r.data),

  queue: (filters: QueueFilters = {}) =>
    http.get<QueuePage>(`${BASE}/questions/queue/`, { params: filters as Record<string, string> }).then((r) => r.data),

  queueNext: (filters: { search_run?: number; cursor?: number } = {}) =>
    http
      .get<{ cursor: number; question: ReviewQuestion }>(`${BASE}/questions/queue/next/`, {
        params: filters as Record<string, string>,
      })
      .then((r) => r.data),

  runs: (filters: { source?: string; fingerprint?: string; limit?: number; offset?: number } = {}) =>
    http
      .get<{ total: number; limit: number; offset: number; results: SearchRun[] }>(`${BASE}/question-search/`, {
        params: filters as Record<string, string>,
      })
      .then((r) => r.data),

  run: (id: number) => http.get<SearchRun>(`${BASE}/question-search/${id}/`).then((r) => r.data),

  startSearch: (body: { source: string; filters: Record<string, unknown>; limit?: number; dry_run?: boolean }) =>
    http.post<SearchRun>(`${BASE}/question-search/`, body).then((r) => r.data),

  continueSearch: (id: number, body: { limit?: number; dry_run?: boolean } = {}) =>
    http.post<SearchRun>(`${BASE}/question-search/${id}/continue/`, body).then((r) => r.data),

  rerunSearch: (id: number, body: { limit?: number; dry_run?: boolean } = {}) =>
    http.post<SearchRun>(`${BASE}/question-search/${id}/rerun/`, body).then((r) => r.data),

  importSkipped: (id: number, body: { limit?: number; dry_run?: boolean } = {}) =>
    http.post<SearchRun>(`${BASE}/question-search/${id}/import-skipped/`, body).then((r) => r.data),

  approve: (body: { id: number; explanation: string; updated_at?: string }) =>
    http.post<{ results: ReviewQuestion[] }>(`${BASE}/questions/approve/`, body).then((r) => r.data),

  reject: (body: { id: number; reason: string; reason_code: string; updated_at?: string }) =>
    http.post<{ results: ReviewQuestion[] }>(`${BASE}/questions/reject/`, body).then((r) => r.data),

  draft: (body: { id: number; note: string }) =>
    http.post<{ results: ReviewQuestion[] }>(`${BASE}/questions/draft/`, body).then((r) => r.data),

  rejectionReasons: () =>
    http
      .get<{ results: RejectionReasons }>(`${BASE}/questions/rejection-reasons/`)
      .then((r) => r.data.results)
      .catch(() => [] as RejectionReasons),
};

/** `A`..`E` — o gabarito é lido por letra, nunca por índice. */
export function answerLetter(index: number) {
  return String.fromCharCode(65 + Math.max(0, index));
}

/** Texto que a API devolveu, seja `detail` solo, `ValidationError` por campo ou lista. */
export function apiMessage(data: unknown, fallback: string) {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
    const parts: string[] = [];
    Object.entries(record).forEach(([field, value]) => {
      const items = Array.isArray(value) ? value : [value];
      const text = items.filter((item) => typeof item === "string").join(" ");
      if (text) parts.push(field === "detail" ? text : `${field}: ${text}`);
    });
    if (parts.length) return parts.join(" · ");
  }
  return fallback;
}
