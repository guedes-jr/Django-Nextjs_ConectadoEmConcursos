"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import { http } from "@/lib/http";
import { getStatistics, Statistics } from "@/lib/statistics";

type StudyDiscipline =
  | "Português"
  | "Matemática"
  | "Direito Constitucional"
  | "Direito Administrativo"
  | "Direito Penal"
  | "Direito Civil"
  | "Informática"
  | "Conhecimentos Gerais"
  | "Raciocínio Lógico"
  | "Contabilidade"
  | "Pedagogia";

const DISCIPLINES: StudyDiscipline[] = [
  "Português",
  "Matemática",
  "Direito Constitucional",
  "Direito Administrativo",
  "Direito Penal",
  "Direito Civil",
  "Informática",
  "Conhecimentos Gerais",
  "Raciocínio Lógico",
  "Contabilidade",
  "Pedagogia",
];

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

type TabKey = "profile" | "history" | "stats";

type MePayload = {
  id: number;
  email: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar?: string | null;
  social_avatar?: string | null;

  phone?: string | null;
  state?: string | null;
  city?: string | null;
  profession?: string | null;

  target_role?: string | null;
  study_hours_per_day?: number | null;
  disciplines?: StudyDiscipline[] | null;
};

type FormState = {
  first_name: string;
  last_name: string;
  username: string;

  phone: string;
  state: string;
  city: string;
  profession: string;

  target_role: string;
  study_hours_per_day: string;
  disciplines: StudyDiscipline[];
};

type HistoryItem = {
  id: string;
  date: string;
  title: string;
  detail: string;
};

function getInitials(text: string) {
  const clean = (text || "").trim();
  if (!clean) return "U";
  const parts = clean
    .replace(/[^a-zA-Z0-9À-ÿ\s._-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function pickDisplayName(me: any) {
  const full =
    [me?.first_name, me?.last_name].filter(Boolean).join(" ").trim() || "";
  if (full) return full;
  if (me?.username) return String(me.username);
  if (me?.email) return String(me.email);
  return "Usuário";
}

function normalizeAvatarUrl(url: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;

  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  if (trimmed.startsWith("/")) return `${base.replace(/\/$/, "")}${trimmed}`;

  return `${base.replace(/\/$/, "")}/media/${trimmed.replace(/^\/+/, "")}`;
}

function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between px-6 pt-5">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </div>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Tabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  const base =
    "px-4 py-2 text-sm font-medium rounded-lg border transition";
  const activeCls =
    "bg-blue-600 text-white border-blue-600";
  const idleCls =
    "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`${base} ${active === "profile" ? activeCls : idleCls}`}
        onClick={() => onChange("profile")}
      >
        Perfil
      </button>
      <button
        type="button"
        className={`${base} ${active === "history" ? activeCls : idleCls}`}
        onClick={() => onChange("history")}
      >
        Histórico
      </button>
      <button
        type="button"
        className={`${base} ${active === "stats" ? activeCls : idleCls}`}
        onClick={() => onChange("stats")}
      >
        Estatísticas
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { me, isLoading, isAuthenticated, refresh } = useMe();

  const [tab, setTab] = useState<TabKey>("profile");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    first_name: "",
    last_name: "",
    username: "",
    phone: "",
    state: "",
    city: "",
    profession: "",
    target_role: "",
    study_hours_per_day: "0",
    disciplines: [],
  });

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!me) return;
    const typed = me as unknown as MePayload;

    setForm({
      first_name: typed.first_name ?? "",
      last_name: typed.last_name ?? "",
      username: typed.username ?? "",
      phone: typed.phone ?? "",
      state: typed.state ?? "",
      city: typed.city ?? "",
      profession: typed.profession ?? "",
      target_role: typed.target_role ?? "",
      study_hours_per_day: String(typed.study_hours_per_day ?? 0),
      disciplines: typed.disciplines ?? [],
    });
  }, [me]);

  const displayName = useMemo(() => pickDisplayName(me), [me]);
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  const avatarUrl = useMemo(() => {
    const social = normalizeAvatarUrl((me as any)?.social_avatar ?? null);
    if (social) return social;
    const uploaded = normalizeAvatarUrl((me as any)?.avatar ?? null);
    if (uploaded) return uploaded;
    return null;
  }, [me]);

  async function handleAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const data = new FormData();
      data.append("avatar", file);
      await http.post("/api/profile/avatar/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refresh();
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const payload: Partial<MePayload> = {
        first_name: form.first_name,
        last_name: form.last_name,
        username: form.username,

        phone: form.phone,
        state: form.state,
        city: form.city,
        profession: form.profession,

        target_role: form.target_role,
        study_hours_per_day: Number(form.study_hours_per_day || 0),
        disciplines: form.disciplines,
      };

      await http.patch("/api/me/", payload);
      await refresh();
      setSaveMessage("Perfil atualizado com sucesso.");
    } catch (error: any) {
      const data = error?.response?.data;
      const firstError = data && typeof data === "object"
        ? Object.values(data).flat().find((item) => typeof item === "string")
        : null;
      setSaveMessage(
        typeof firstError === "string"
          ? firstError
          : "Não foi possível atualizar o perfil."
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleDiscipline(d: StudyDiscipline) {
    setForm((s) => {
      const exists = s.disciplines.includes(d);
      return {
        ...s,
        disciplines: exists
          ? s.disciplines.filter((x) => x !== d)
          : [...s.disciplines, d],
      };
    });
  }

  const loadHistoryIfNeeded = useCallback(async () => {
    if (historyItems.length > 0) return;
    setHistoryLoading(true);
    try {
      const data = statistics ?? await getStatistics();
      setStatistics(data);
      setHistoryItems(data.recent_activity.map((item) => ({
        id: String(item.id),
        date: new Date(item.date).toLocaleString("pt-BR"),
        title: item.is_correct ? "Questão respondida corretamente" : "Questão respondida incorretamente",
        detail: `${item.discipline} · Questão ${item.question_id}`,
      })));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyItems.length, statistics]);

  useEffect(() => {
    if (tab === "history") void loadHistoryIfNeeded();
    if (tab === "stats" && !statistics) {
      void getStatistics().then(setStatistics);
    }
  }, [tab, loadHistoryIfNeeded, statistics]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-8">Carregando…</div>
      </div>
    );
  }

  if (!isAuthenticated || !me) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Meu Perfil
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Gerencie seus dados, histórico e estatísticas.
            </p>
          </div>

          <Tabs
            active={tab}
            onChange={(t) => setTab(t)}
          />
        </div>

        {tab === "profile" && (
          <div className="space-y-6">
            <Card
              title="Foto de Perfil"
              right={
                <span className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  Plano Gratuito
                </span>
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt="Avatar"
                        width={80}
                        height={80}
                        className="h-20 w-20 object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {initials}
                      </span>
                    )}
                  </div>

                  <label className="absolute -bottom-2 left-1/2 -translate-x-1/2 cursor-pointer">
                    <div className="h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow">
                      {uploadingAvatar ? "…" : "📷"}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleAvatar(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>

                <div className="min-w-0">
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {displayName}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 truncate">
                    {(me as any)?.email}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    Clique no ícone da câmera para alterar sua foto
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title="Informações Pessoais">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Nome
                    </label>
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.first_name}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, first_name: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Sobrenome
                    </label>
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.last_name}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, last_name: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Username
                    </label>
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.username}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, username: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Telefone
                    </label>
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, phone: e.target.value }))
                      }
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Profissão
                    </label>
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.profession}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, profession: e.target.value }))
                      }
                      placeholder="Ex: Professor, Advogado, Estudante..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Estado
                    </label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.state}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, state: e.target.value }))
                      }
                    >
                      <option value="">Selecione seu estado</option>
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Cidade
                    </label>
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.city}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, city: e.target.value }))
                      }
                      placeholder="Digite sua cidade"
                    />
                  </div>
                </div>
              </Card>

              <Card title="Preferências de Estudo">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Cargo Pretendido
                    </label>
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.target_role}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, target_role: e.target.value }))
                      }
                      placeholder="Ex: Técnico Judiciário, Agente Administrativo..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Horas de Estudo por Dia
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 text-sm"
                      value={form.study_hours_per_day}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          study_hours_per_day: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-600 dark:text-slate-400">
                      Disciplinas Preferidas
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {DISCIPLINES.map((d) => {
                        const active = form.disciplines.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDiscipline(d)}
                            className={`px-3 py-2 rounded-lg border text-sm transition ${
                              active
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-transparent text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex items-center justify-end gap-4">
              {saveMessage && (
                <p className="text-sm text-slate-600 dark:text-slate-300" role="status">
                  {saveMessage}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="h-11 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-6">
            <Card
              title="Histórico"
              right={
                <button
                  type="button"
                  onClick={() => void loadHistoryIfNeeded()}
                  className="text-xs px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  Atualizar
                </button>
              }
            >
              {historyLoading ? (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Carregando histórico…
                </div>
              ) : (
                <div className="space-y-3">
                  {historyItems.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {it.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-500">
                          {it.date}
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {it.detail}
                      </div>
                    </div>
                  ))}

                  {historyItems.length === 0 && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Nenhum evento ainda.
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Questões resolvidas
                </div>
                <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
                  {statistics?.last_30_total ?? 0}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  Últimos 30 dias
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Taxa de acerto
                </div>
                <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
                  {statistics?.accuracy ?? 0}%
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  Média geral
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Streak atual
                </div>
                <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
                  {statistics?.streak ?? 0} dias
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  Consistência
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Acertos recentes
                </div>
                <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
                  {statistics?.last_30_correct ?? 0}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  Últimos 30 dias
                </div>
              </div>
            </div>

            <Card title="Visão Geral">
              <div className="space-y-3">
                {(statistics?.disciplines ?? []).map((item) => (
                  <div key={item.discipline} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-slate-700 dark:text-slate-200">{item.discipline}</span>
                    <span className="text-slate-500">{item.correct}/{item.total} acertos · {item.accuracy}%</span>
                  </div>
                ))}
                {statistics && statistics.disciplines.length === 0 && <p className="text-sm text-slate-500">Resolva questões para iniciar suas estatísticas.</p>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
