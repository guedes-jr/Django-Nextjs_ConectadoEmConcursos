import { http } from "@/lib/http";

export type Overview = {
  users: { total: number; active: number; staff: number };
  subscriptions: { total: number; active: number; pending: number; canceled: number };
  plans: { total: number; active: number };
  questions: { total: number; uncommented: number; with_comment: number };
  proofs: { pending: number; reviewed: number };
  content: {
    news_total: number;
    news_unpublished: number;
    community_posts: number;
    concursos_total: number;
    concursos_open: number;
  };
  backups: { count: number; last: string | null; last_created_at: string | null };
  recent_subscriptions: Array<{
    id: number;
    username: string;
    plan: string;
    status: string;
    cycle: string;
    created_at: string;
  }>;
  recent_users: Array<{
    id: number;
    username: string;
    email: string;
    is_staff: boolean;
    date_joined: string;
  }>;
};

export type SubscriptionRow = {
  id: number;
  user_id: number;
  username: string;
  email: string;
  plan_slug: string;
  plan_name: string;
  cycle: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type UserRow = {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  date_joined: string;
  subscription: {
    id: number;
    plan: string;
    plan_slug: string;
    status: string;
    cycle: string;
  } | null;
};

export type Plan = {
  id: number;
  slug: string;
  name: string;
  monthly_price: string;
  semiannual_price: string;
  annual_price: string;
  features: string[];
  is_active: boolean;
  sort_order: number;
};

export type ProofRow = {
  id: number;
  username: string;
  title: string;
  status: string;
  created_at: string;
};

export type QuestionAdminRow = {
  id: number;
  exam_title: string | null;
  discipline: string;
  banca: string;
  statement: string;
  explanation: string;
  is_active: boolean;
};

export type NewsAdminRow = {
  id: number;
  title: string;
  category: string;
  is_published: boolean;
  published_at: string | null;
};

export type CommunityPostRow = {
  id: number;
  username: string;
  kind: string;
  title: string;
  replies: number;
  created_at: string;
};

export type ConcursoRow = {
  id: number;
  title: string;
  organization: string;
  state: string;
  status: string;
  deadline: string | null;
  published_at: string | null;
};

export type BackupRow = {
  name: string;
  size: number;
  created_at: string;
};

export type PlanPayload = {
  slug: string;
  name: string;
  monthly_price?: string | number;
  semiannual_price?: string | number;
  annual_price?: string | number;
  features?: string[];
  is_active?: boolean;
  sort_order?: number;
};

export const backoffice = {
  overview: () => http.get<Overview>("/api/backoffice/overview/").then((r) => r.data),

  listUsers: (opts: { search?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.search) params.set("search", opts.search);
    if (opts.limit) params.set("limit", String(opts.limit));
    return http.get<{ results: UserRow[]; total: number }>(`/api/backoffice/users/?${params}`).then((r) => r.data);
  },
  setUserActive: (id: number, isActive: boolean) =>
    http.patch<UserRow>(`/api/backoffice/users/${id}/`, { is_active: isActive }).then((r) => r.data),
  assignSubscription: (userId: number, plan: string, cycle: string) =>
    http
      .post<{ id: number; status: string; plan: string }>(`/api/backoffice/users/${userId}/subscription/`, { plan, cycle })
      .then((r) => r.data),

  listSubscriptions: (opts: { status?: string; search?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.search) params.set("search", opts.search);
    return http
      .get<{ results: SubscriptionRow[] }>(`/api/backoffice/subscriptions/?${params}`)
      .then((r) => r.data);
  },
  updateSubscription: (id: number, data: Partial<Pick<SubscriptionRow, "plan_slug" | "cycle" | "status">>) =>
    http.patch<SubscriptionRow>(`/api/backoffice/subscriptions/${id}/`, data).then((r) => r.data),

  listPlans: () => http.get<{ results: Plan[] }>("/api/backoffice/plans/").then((r) => r.data),
  createPlan: (data: PlanPayload) => http.post<Plan>("/api/backoffice/plans/", data).then((r) => r.data),
  updatePlan: (id: number, data: Partial<PlanPayload>) =>
    http.patch<Plan>(`/api/backoffice/plans/${id}/`, data).then((r) => r.data),
  deletePlan: (id: number) => http.delete(`/api/backoffice/plans/${id}/`).then((r) => r.data),

  listProofs: (opts: { status?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    return http.get<{ results: ProofRow[] }>(`/api/backoffice/content/proofs/?${params}`).then((r) => r.data);
  },
  setProofStatus: (id: number, status: string) =>
    http.patch<{ id: number; status: string }>("/api/backoffice/content/proofs/", { id, status }).then((r) => r.data),

  listQuestions: (opts: { onlyUncommented?: boolean; search?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.onlyUncommented) params.set("only_uncommented", "1");
    if (opts.search) params.set("search", opts.search);
    return http
      .get<{ total: number; results: QuestionAdminRow[] }>(`/api/backoffice/content/questions/?${params}`)
      .then((r) => r.data);
  },
  updateQuestion: (id: number, data: { explanation?: string; is_active?: boolean }) =>
    http.patch<{ id: number; explanation: string; is_active: boolean }>("/api/backoffice/content/questions/", { id, ...data }).then((r) => r.data),

  listNews: (opts: { published?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (typeof opts.published === "boolean") params.set("published", opts.published ? "1" : "0");
    return http.get<{ results: NewsAdminRow[] }>(`/api/backoffice/content/news/?${params}`).then((r) => r.data);
  },
  setNewsPublished: (id: number, isPublished: boolean) =>
    http.patch<{ id: number; is_published: boolean }>("/api/backoffice/content/news/", { id, is_published: isPublished }).then((r) => r.data),

  listCommunity: () => http.get<{ results: CommunityPostRow[] }>("/api/backoffice/content/community/").then((r) => r.data),
  deleteCommunityPost: (id: number) =>
    http.delete<{ deleted: number | null }>(`/api/backoffice/content/community/?id=${id}`).then((r) => r.data),

  listConcursos: (opts: { search?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.search) params.set("search", opts.search);
    return http
      .get<{ total: number; results: ConcursoRow[] }>(`/api/backoffice/content/concursos/?${params}`)
      .then((r) => r.data);
  },

  listBackups: () => http.get<{ results: BackupRow[] }>("/api/backoffice/backups/").then((r) => r.data),
  createBackup: () => http.post<{ name: string }>("/api/backoffice/backups/").then((r) => r.data),
  restoreBackup: (name: string) =>
    http
      .post<{ restored: string; previous_db_saved_at: string }>(`/api/backoffice/backups/${encodeURIComponent(name)}/restore/`)
      .then((r) => r.data),
};

export function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const statusLabel: Record<string, string> = {
  active: "Ativa",
  pending_payment: "Pagamento pendente",
  canceled: "Cancelada",
  pending: "Pendente",
  reviewed: "Revisada",
};

export const statusColor: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  pending_payment: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  canceled: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  reviewed: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  expected: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  closed: "bg-slate-200 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

export const cycleLabel: Record<string, string> = {
  mensal: "Mensal",
  semestral: "Semestral",
  anual: "Anual",
};