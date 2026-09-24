"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Briefcase,
  Clock,
  EyeOff,
  MapPin,
  Target,
  UserRound,
} from "lucide-react";

import { getPublicProfile, type PublicProfile } from "@/lib/workspace";

function normalizeAvatarUrl(url: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  if (trimmed.startsWith("/")) return `${base.replace(/\/$/, "")}${trimmed}`;
  return `${base.replace(/\/$/, "")}/media/${trimmed.replace(/^\/+/, "")}`;
}

function getInitials(name: string) {
  const clean = (name || "").trim();
  if (!clean) return "U";
  const parts = clean
    .replace(/[^a-zA-Z0-9À-ÿ\s._-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function UserProfilePage() {
  const params = useParams();
  const username = String(params.username ?? "");

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setProfile(null);
    getPublicProfile(username)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [username]);

  const avatar =
    normalizeAvatarUrl(profile?.social_avatar ?? null) ??
    normalizeAvatarUrl(profile?.avatar ?? null);

  const location = [profile?.city, profile?.state].filter(Boolean).join(" - ");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/people"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para a busca
        </Link>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Carregando perfil…
          </div>
        ) : notFound || !profile ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <EyeOff className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Perfil não disponível
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Este perfil não existe ou a pessoa optou por não aparecer para outros usuários.
            </p>
          </div>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={profile.name}
                  className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-blue-50 dark:ring-blue-950"
                />
              ) : (
                <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  {getInitials(profile.name)}
                </span>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
                  {profile.name}
                </h1>
                <p className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 sm:justify-start">
                  <UserRound className="h-4 w-4" /> @{profile.username}
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <Briefcase className="h-5 w-5 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">Profissão</div>
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {profile.profession || "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <Target className="h-5 w-5 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">Cargo pretendido</div>
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {profile.target_role || "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <Clock className="h-5 w-5 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">Horas de estudo por dia</div>
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {profile.study_hours_per_day || 0} h
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <MapPin className="h-5 w-5 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">Localização</div>
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {location || "—"}
                  </div>
                </div>
              </div>
            </div>

            {profile.disciplines.length > 0 && (
              <div className="mt-6 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <BookOpen className="h-4 w-4" /> Disciplinas preferidas
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.disciplines.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <Brain className="h-3.5 w-3.5 text-blue-600" />
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}