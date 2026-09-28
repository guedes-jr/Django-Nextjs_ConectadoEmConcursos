import { http } from "@/lib/http";

export type Overview = {
  users: { total: number; active: number; staff: number };
  subscriptions: { total: number; active: number; pending_payment: number; canceled: number };
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
  description: string;
  status: "draft" | "published" | "archived";
  is_highlighted: boolean;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
};

export type PlansOverview = {
  total: number; published: number; draft: number; archived: number; mrr_estimated: string;
  plans: Array<{ id: number; subscribers_total: number; subscribers_active: number; subscribers_pending: number; subscribers_canceled: number; mrr_estimated: string; retention_rate: number | null }>;
};

export type ProofRow = {
  id: number;
  username: string;
  title: string;
  status: string;
  /** Insumo da conversão: o que o aluno mandou. */
  file_url: string | null;
  source_url: string;
  description: string;
  rights_confirmed: boolean;
  converted_questions: number;
  converted_run: number | null;
  created_at: string;
};

export type ConvertedProof = {
  id: number;
  name: string;
  status: string;
  counts: Record<string, number>;
  submission: {
    id: number;
    title: string;
    username: string;
    converted_questions: number;
    converted_at: string | null;
  };
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

export type ChatUsageReport = {
  conversations: number;
  messages: number;
  queries: number;
  input_tokens: number;
  output_tokens: number;
  active_users: number;
  daily: Array<{ date: string; queries: number; tokens: number }>;
  top_users: Array<{
    user_id: number;
    username: string;
    queries: number;
    tokens: number;
    last_used: string | null;
  }>;
};

export type StudyReport = {
  total_answers: number;
  correct_answers: number;
  accuracy: number;
  total_minutes: number;
  flashcards: number;
  simulations: { total: number; avg_score: number; max_score: number | null };
  active_users: number;
  daily: Array<{ date: string; answers: number; correct: number; minutes: number }>;
  top_students: Array<{
    user_id: number;
    username: string;
    answers: number;
    correct: number;
    minutes: number;
    last_activity: string | null;
  }>;
  by_discipline: Array<{ discipline: string; total: number; correct: number }>;
};

export type StaffRow = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  roles: Array<"admin" | "editor" | "reviewer">;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
};

export type PlanPayload = {
  slug: string;
  name: string;
  monthly_price?: string | number;
  semiannual_price?: string | number;
  annual_price?: string | number;
  features?: string[];
  description?: string;
  status?: "draft" | "published" | "archived";
  is_highlighted?: boolean;
  trial_days?: number;
  is_active?: boolean;
  sort_order?: number;
};

export const backoffice = {
  overview: () => http.get<Overview>("/api/backoffice/overview/").then((r) => r.data),

  listUsers: (opts: { search?: string; limit?: number; status?: string; plan?: string; subscription?: string; activity?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(opts).forEach(([key, value]) => { if (value) params.set(key, String(value)); });
    return http.get<{ results: UserRow[]; total: number }>(`/api/backoffice/users/?${params}`).then((r) => r.data);
  },
  getUser: (id: number) => http.get<any>(`/api/backoffice/users/${id}/`).then((r) => r.data),
  updateUser: (id: number, data: Record<string, unknown>) => http.patch<any>(`/api/backoffice/users/${id}/`, data).then((r) => r.data),
  userHistory: (id: number) => http.get<any>(`/api/backoffice/users/${id}/history/`).then((r) => r.data),
  userAction: (id: number, action: string, reason = "") => http.post<any>(`/api/backoffice/users/${id}/actions/`, { action, reason }).then((r) => r.data),
  sendUserNotification: (id: number, data: { title: string; body?: string; category?: string; link?: string }) => http.post(`/api/backoffice/users/${id}/notification/`, data).then((r) => r.data),
  setUserActive: (id: number, isActive: boolean) =>
    http.patch<UserRow>(`/api/backoffice/users/${id}/`, { is_active: isActive }).then((r) => r.data),
  assignSubscription: (userId: number, plan: string, cycle: string) =>
    http
      .post<{ id: number; status: string; plan: string }>(`/api/backoffice/users/${userId}/subscription/`, { plan, cycle })
      .then((r) => r.data),

  subscriptionsOverview: () => http.get<{ total: number; active: number; pending: number; canceled: number; expiring_30_days: number; mrr_estimated: string }>("/api/backoffice/subscriptions/overview/").then((r) => r.data),
  listSubscriptions: (opts: { status?: string; search?: string; plan?: string; cycle?: string; expires_within?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.search) params.set("search", opts.search);
    return http
      .get<{ results: SubscriptionRow[] }>(`/api/backoffice/subscriptions/?${params}`)
      .then((r) => r.data);
  },
  updateSubscription: (id: number, data: { plan_slug?: string; cycle?: string; status?: string }) =>
    http
      .patch<SubscriptionRow>(`/api/backoffice/subscriptions/${id}/`, {
        ...(data.plan_slug !== undefined ? { plan: data.plan_slug } : {}),
        ...(data.cycle !== undefined ? { cycle: data.cycle } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      })
      .then((r) => r.data),

  listPlans: (opts: { q?: string; status?: string; active?: boolean; price_min?: number; price_max?: number } = {}) => {
    const params = new URLSearchParams();
    Object.entries(opts).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
    return http.get<{ results: Plan[] }>(`/api/backoffice/plans/?${params}`).then((r) => r.data);
  },
  plansOverview: () => http.get<PlansOverview>("/api/backoffice/plans/overview/").then((r) => r.data),
  bulkPlans: (ids: number[], action: "publish" | "draft" | "archive" | "activate" | "deactivate") => http.post<{ updated: number }>("/api/backoffice/plans/bulk/", { ids, action }).then((r) => r.data),
  duplicatePlan: (id: number) => http.post<Plan>(`/api/backoffice/plans/${id}/duplicate/`).then((r) => r.data),
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
  /** Converte a prova em questões pelo mesmo pipeline das fontes. */
  convertProof: (data: { id: number; content?: string; file?: File; rights_confirmed?: boolean; dry_run?: boolean }) => {
    if (data.file) {
      const form = new FormData();
      form.append("id", String(data.id));
      form.append("file", data.file);
      if (data.content) form.append("content", data.content);
      if (data.rights_confirmed) form.append("rights_confirmed", "true");
      if (data.dry_run) form.append("dry_run", "true");
      return http
        .post<ConvertedProof>("/api/backoffice/content/proofs/convert/", form, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data);
    }
    return http
      .post<ConvertedProof>("/api/backoffice/content/proofs/convert/", {
        id: data.id,
        content: data.content ?? "",
        rights_confirmed: data.rights_confirmed ?? false,
        dry_run: data.dry_run ?? false,
      })
      .then((r) => r.data);
  },

  listQuestions: (opts: { onlyUncommented?: boolean; search?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.onlyUncommented) params.set("only_uncommented", "1");
    if (opts.search) params.set("search", opts.search);
    return http
      .get<{ total: number; results: QuestionAdminRow[] }>(`/api/backoffice/content/questions/?${params}`)
      .then((r) => r.data);
  },
  updateQuestion: (id: number, data: { action?: string; statement?: string; banca?: string; discipline?: string; year?: number; options?: string[]; correct_answer?: number; explanation?: string }) =>
    http.patch<{ id: number; status?: string; explanation?: string }>("/api/backoffice/content/questions/", { id, ...data }).then((r) => r.data),

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

  chatUsage: (days = 14) =>
    http.get<ChatUsageReport>(`/api/backoffice/chat/?days=${days}`).then((r) => r.data),

  studyReport: (days = 14) =>
    http.get<StudyReport>(`/api/backoffice/reports/study/?days=${days}`).then((r) => r.data),

  listStaff: () =>
    http.get<{ results: StaffRow[] }>("/api/backoffice/staff/").then((r) => r.data),
  createStaff: (data: { username: string; email?: string; password: string; role?: "admin" | "editor" | "reviewer" }) =>
    http.post<StaffRow>("/api/backoffice/staff/", data).then((r) => r.data),
  updateStaff: (id: number, data: Partial<Pick<StaffRow, "is_staff" | "is_active" | "email" | "first_name" | "last_name" | "roles">> & { role?: "admin" | "editor" | "reviewer" }) =>
    http.patch<StaffRow>(`/api/backoffice/staff/${id}/`, data).then((r) => r.data),
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
export type EditorialConcurso = { id: number; title: string; organization: string; state: string; status: string; deadline: string | null; source_url: string; origin: "manual" | "imported"; editorial_status: "published" | "archived"; exams_count: number; updated_at: string };
export type EditorialExam = { id: number; title: string; banca: string; institution: string; role: string; year: number; is_published: boolean; concurso: number | null; questions_count: number; updated_at: string };
export const editorial = {
  listConcursos: () => http.get<{results: EditorialConcurso[]}>("/api/backoffice/content/editorial/concursos/").then(r => r.data),
  createConcurso: (data: Partial<EditorialConcurso>) => http.post<EditorialConcurso>("/api/backoffice/content/editorial/concursos/", data).then(r => r.data),
  updateConcurso: (id: number, data: Partial<EditorialConcurso>) => http.patch<EditorialConcurso>(`/api/backoffice/content/editorial/concursos/${id}/`, data).then(r => r.data),
  listExams: () => http.get<{results: EditorialExam[]}>("/api/backoffice/content/editorial/provas/").then(r => r.data),
  createExam: (data: Partial<EditorialExam>) => http.post<EditorialExam>("/api/backoffice/content/editorial/provas/", data).then(r => r.data),
  updateExam: (id: number, data: Partial<EditorialExam>) => http.patch<EditorialExam>(`/api/backoffice/content/editorial/provas/${id}/`, data).then(r => r.data),
};

export type ManualQuestion = { id: number; status: "draft" | "pending" | "rejected" | "approved"; statement: string; options: string[]; correct_answer: number; discipline: string; banca: string; year: number; source_url: string; source?: { slug: string; label: string } | null; exam: string | null; exam_id?: number | null; number?: number | null; explanation?: string; rejection_reason: string; updated_at: string };
export const manualQuestions = {
  list: () => http.get<{results: ManualQuestion[]}>("/api/backoffice/content/questions/manual/").then(r => r.data),
  create: (data: Omit<ManualQuestion, "id" | "status" | "exam" | "rejection_reason" | "updated_at">) => http.post<ManualQuestion>("/api/backoffice/content/questions/manual/", data).then(r => r.data),
  update: (id: number, data: Omit<Partial<ManualQuestion>, "exam"> & { exam?: number | null }) => http.patch<ManualQuestion>(`/api/backoffice/content/questions/manual/${id}/`, data).then((r) => r.data),
  publish: (id: number) => http.post<ManualQuestion>(`/api/backoffice/content/questions/manual/${id}/publish/`).then(r => r.data),
  unpublish: (id: number) => http.post<ManualQuestion>(`/api/backoffice/content/questions/manual/${id}/unpublish/`).then(r => r.data),
  submit: (id: number) => http.post<ManualQuestion>(`/api/backoffice/content/questions/manual/${id}/submit/`).then(r => r.data),
};
export type EditorialArticle = { id:number; title:string; slug:string; summary:string; body:string; category:string; image_url:string; seo_title:string; seo_description:string; tags:string[]; is_featured:boolean; is_pinned:boolean; origin:"manual"|"imported"; editorial_status:"draft"|"scheduled"|"published"|"archived"; is_published:boolean; scheduled_for?: string | null };
export const editorialArticles = { list:(opts:{status?:string;search?:string;category?:string}={})=>{const q=new URLSearchParams();Object.entries(opts).forEach(([k,v])=>{if(v)q.set(k,v)});return http.get<{results:EditorialArticle[]}>(`/api/backoffice/content/editorial/artigos/?${q}`).then(r=>r.data)}, overview:()=>http.get<{total:number;draft:number;scheduled:number;published:number;archived:number;featured:number}>("/api/backoffice/content/editorial/artigos/overview/").then(r=>r.data), bulk:(ids:number[],action:"draft"|"published"|"archived")=>http.post<{updated:number}>("/api/backoffice/content/editorial/artigos/bulk/",{ids,action}).then(r=>r.data), duplicate:(id:number)=>http.post<EditorialArticle>(`/api/backoffice/content/editorial/artigos/${id}/duplicate/`).then(r=>r.data), create:(data:Partial<EditorialArticle>)=>http.post<EditorialArticle>("/api/backoffice/content/editorial/artigos/",data).then(r=>r.data), update:(id:number,data:Partial<EditorialArticle>)=>http.patch<EditorialArticle>(`/api/backoffice/content/editorial/artigos/${id}/`,data).then(r=>r.data) };
export type BancaCatalogRow={id:number;name:string;slug:string;official_url:string;description:string;image_url:string;is_active:boolean;is_featured:boolean;aliases:{id:number;alias:string}[];questions_count:number;exams_count:number};
export const bancasAdmin={list:()=>http.get<{results:BancaCatalogRow[]}>("/api/backoffice/content/bancas/").then(r=>r.data),create:(data:Partial<BancaCatalogRow>)=>http.post<BancaCatalogRow>("/api/backoffice/content/bancas/",data).then(r=>r.data),update:(id:number,data:Partial<BancaCatalogRow>)=>http.patch<BancaCatalogRow>(`/api/backoffice/content/bancas/${id}/`,data).then(r=>r.data),addAlias:(id:number,alias:string)=>http.post(`/api/backoffice/content/bancas/${id}/aliases/`,{alias}).then(r=>r.data)};


export type AdminNotificationRow = { id:number; title:string; summary:string; body:string; priority:string; status:string; scope:string; segment_plan_slug?:string; segment_subscription_status?:string; starts_at:string|null; ends_at:string|null; image_url?:string; video_url?:string; postpone_hours?:number; max_postpones?:number; selected_user_ids:number[]; metrics:{total:number;pending:number;viewed:number;postponed:number}; };
export const adminNotifications = {
  list: () => http.get<{results:AdminNotificationRow[]}>("/api/backoffice/notifications/").then(r => r.data),
  create: (data: Partial<AdminNotificationRow> & {selected_user_ids:number[]}) => http.post<AdminNotificationRow>("/api/backoffice/notifications/", data).then(r => r.data),
  update: (id:number, data: Partial<AdminNotificationRow> & {selected_user_ids?:number[]}) => http.patch<AdminNotificationRow>(`/api/backoffice/notifications/${id}/`, data).then(r => r.data),
  publish: (id:number) => http.post<AdminNotificationRow>(`/api/backoffice/notifications/${id}/publish/`, {}).then(r => r.data),
  close: (id:number, reason:string) => http.post<AdminNotificationRow>(`/api/backoffice/notifications/${id}/close/`, { reason }).then(r => r.data),
  archive: (id:number) => http.post<AdminNotificationRow>(`/api/backoffice/notifications/${id}/archive/`, {}).then(r => r.data),
};


export type AuditEventRow = {id:number; action:string; resource_type:string; resource_id:string; actor:{id:number;username:string}|null; before:Record<string,unknown>; after:Record<string,unknown>; reason:string; ip_address:string|null; request_id:string|null; created_at:string};
export const auditAdmin = { list: (params:Record<string,string|number|undefined>={}) => { const query=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!==undefined && v!=="")query.set(k,String(v))}); return http.get<{total:number;page:number;limit:number;results:AuditEventRow[]}>(`/api/backoffice/audit/?${query}`).then(r=>r.data); } };

export const businessReports = { get:(days:number)=>http.get("/api/backoffice/reports/business/",{params:{days}}).then(r=>r.data) };

export const diagnostics = {
  overview: () => http.get("/api/backoffice/diagnostics/overview/").then(r => r.data),
  services: () => http.get("/api/backoffice/diagnostics/services/").then(r => r.data),
  database: () => http.get("/api/backoffice/diagnostics/database/").then(r => r.data),
  logs: (params: Record<string, string | number | undefined> = {}) => http.get("/api/backoffice/diagnostics/logs/", { params }).then(r => r.data),
  scripts: () => http.get("/api/backoffice/diagnostics/scripts/").then(r => r.data),
  runScript: (script: string) => http.post("/api/backoffice/diagnostics/scripts/", { script }).then(r => r.data),
};

export const editorialDashboard={get:()=>http.get("/api/backoffice/editorial-dashboard/").then(r=>r.data)};
