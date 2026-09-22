"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { http } from "@/lib/http";
import AvatarInput from "@/components/auth/AvatarInput";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";

type ApiError = Record<string, string[] | string>;

function normalizeErrors(data: any): {
  global: string[];
  fields: Record<string, string[]>;
} {
  const global: string[] = [];
  const fields: Record<string, string[]> = {};

  if (!data) return { global: ["Erro desconhecido."], fields };

  if (typeof data === "string") {
    return { global: [data], fields };
  }

  const obj: ApiError = data;

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const msgs = Array.isArray(value) ? value.map(String) : [String(value)];

    if (key === "non_field_errors" || key === "detail") {
      global.push(...msgs);
      continue;
    }

    fields[key] = msgs;
  }

  if (global.length === 0 && Object.keys(fields).length === 0) {
    global.push("Não foi possível concluir. Verifique os dados e tente novamente.");
  }

  return { global, fields };
}

function sanitizeUsername(raw: string) {
  return (raw ?? "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 30);
}

function suggestUsernameFromEmail(currentEmail: string) {
  const localPart = (currentEmail.split("@")[0] ?? "").trim();
  const safe = sanitizeUsername(localPart);
  return safe || "usuario";
}

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");

  const [usernameDirty, setUsernameDirty] = useState(false);
  const [emailHasAt, setEmailHasAt] = useState(false);

  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");

  const [loading, setLoading] = useState(false);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const canSubmit = useMemo(() => {
    const passOk =
      password1 === password2 &&
      password1.length >= 8 &&
      /[a-z]/.test(password1) &&
      /[A-Z]/.test(password1) &&
      /[0-9]/.test(password1) &&
      /[^A-Za-z0-9]/.test(password1) &&
      !/^\d+$/.test(password1);

    const userOk = username.trim().length >= 3;
    const emailOk = email.includes("@") && email.trim().length > 3;

    return passOk && userOk && emailOk;
  }, [email, username, password1, password2]);

  const submit = async () => {
    setLoading(true);
    setGlobalErrors([]);
    setFieldErrors({});

    try {
      await http.post("/api/auth/registration/", {
        username: username.trim(),
        email: email.trim(),
        password1,
        password2,
      });

      if (avatarFile) {
        const form = new FormData();
        form.append("avatar", avatarFile);
        await http.post("/api/profile/avatar/", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      router.push("/dashboard");
    } catch (e: any) {
      const { global, fields } = normalizeErrors(e?.response?.data);
      setGlobalErrors(global);
      setFieldErrors(fields);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Criar conta
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Cadastre-se com e-mail e senha
        </p>

        {globalErrors.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/40 p-4">
            <div className="text-sm font-semibold text-red-700 dark:text-red-300">
              Não foi possível criar a conta
            </div>
            <ul className="mt-2 text-sm text-red-700 dark:text-red-300 list-disc pl-5 space-y-1">
              {globalErrors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Foto de perfil (opcional)
            </label>
            <div className="mt-2">
              <AvatarInput
                displayName={username || email}
                value={avatarFile}
                onChange={setAvatarFile}
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              E-mail
            </label>
            <input
              value={email}
              onChange={(e) => {
                const nextEmail = e.target.value;
                setEmail(nextEmail);

                if (usernameDirty) {
                  setEmailHasAt(nextEmail.includes("@"));
                  return;
                }

                const hasAt = nextEmail.includes("@");

                if (!hasAt) {
                  setUsername(sanitizeUsername(nextEmail));
                  setEmailHasAt(false);
                  return;
                }

                if (!emailHasAt) {
                  setUsername(suggestUsernameFromEmail(nextEmail));
                }

                setEmailHasAt(true);
              }}
              className="mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-slate-100"
              type="email"
              placeholder="voce@exemplo.com"
              autoComplete="email"
            />
            {fieldErrors.email?.length ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.email.join(" ")}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Nome de usuário
            </label>
            <input
              value={username}
              onChange={(e) => {
                const v = sanitizeUsername(e.target.value);
                setUsername(v);
                setUsernameDirty(v.length > 0);
              }}
              className="mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-slate-100"
              type="text"
              placeholder="seu_usuario"
              autoComplete="username"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sugestão automática baseada no seu e-mail (você pode editar).
            </p>
            {fieldErrors.username?.length ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.username.join(" ")}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Senha
            </label>
            <input
              value={password1}
              onChange={(e) => setPassword1(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-slate-100"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {fieldErrors.password1?.length ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.password1.join(" ")}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Confirmar senha
            </label>
            <input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-slate-100"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {fieldErrors.password2?.length ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.password2.join(" ")}
              </p>
            ) : null}
          </div>

          <PasswordChecklist password={password1} confirm={password2} />

          <button
            onClick={submit}
            disabled={loading || !canSubmit}
            className="w-full h-11 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            type="button"
          >
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </div>

        <div className="mt-4 text-sm">
          <Link
            href="/"
            className="text-slate-600 dark:text-slate-400 hover:underline"
          >
            Voltar para login
          </Link>
        </div>
      </div>
    </div>
  );
}
