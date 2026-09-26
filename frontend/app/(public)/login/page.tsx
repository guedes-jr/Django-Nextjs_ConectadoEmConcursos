"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { http } from "@/lib/http";
import AvatarInput from "@/components/auth/AvatarInput";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";

type Mode = "login" | "register" | "forgot";
const MODE_INDEX: Record<Mode, number> = { login: 0, register: 1, forgot: 2 };
const backendUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

function safeNextPath(value: string | null) {
  const fallback = "/dashboard";

  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://conectado.local");

    if (url.origin !== "https://conectado.local") {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function MailIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m5.5 7 6.1 4.2a1 1 0 0 0 1.1 0L18.5 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7.5 11V8.7A4.5 4.5 0 0 1 12 4.2a4.5 4.5 0 0 1 4.5 4.5V11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7.2 11h9.6A2.2 2.2 0 0 1 19 13.2v5.6A2.2 2.2 0 0 1 16.8 21H7.2A2.2 2.2 0 0 1 5 18.8v-5.6A2.2 2.2 0 0 1 7.2 11Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20a7 7 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [nextPath, setNextPath] = useState("/dashboard");

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    setNextPath(safeNextPath(next));
  }, []);

  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const [containerHeight, setContainerHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      const active = panelRefs.current[MODE_INDEX[mode]];
      if (active) setContainerHeight(active.offsetHeight);
    });
    return () => cancelAnimationFrame(id);
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [emailHasAt, setEmailHasAt] = useState(false);
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const loginEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      await http.post("/api/auth/login/", { email, password });
      router.replace(nextPath);
    } catch {
      setError("E-mail ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  };

  const loginGoogle = () => {
    const next = encodeURIComponent(nextPath);
    window.location.href = `${backendUrl}/accounts/google/login/?next=${next}`;
  };

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

  const submitRegister = async () => {
    setRegisterLoading(true);
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

      router.replace(nextPath);
    } catch (e: any) {
      const { global, fields } = normalizeErrors(e?.response?.data);
      setGlobalErrors(global);
      setFieldErrors(fields);
    } finally {
      setRegisterLoading(false);
    }
  };

  const sendReset = async () => {
    setResetLoading(true);
    try {
      await http.post("/api/password/reset/", { email: resetEmail });
      setResetSent(true);
    } finally {
      setResetLoading(false);
    }
  };

  const subtitles: Record<Mode, string> = {
    login: "Acesse para continuar",
    register: "Crie sua conta grátis e comece a estudar",
    forgot: "Enviaremos um link para redefinir sua senha",
  };

  const inputShell =
    "mt-2 flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 shadow-sm transition focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-slate-500";
  const inputField =
    "h-full w-full bg-transparent! p-0! border-0! rounded-none! shadow-none! text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500";

  const googleButton = (
    <button
      onClick={loginGoogle}
      className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      type="button"
    >
      <span className="text-lg font-bold text-[#4285F4]">G</span>
      Continue com sua conta Google
    </button>
  );

  return (
    <main
      className="relative min-h-screen"
      style={{
        backgroundImage: 'url("/backgrounds/background_2.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-center gap-1 text-center">
              <div className="mx-auto flex h-35 w-35 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/logos/logo.png"
                  alt="Logo"
                  width={80}
                  height={80}
                  className="object-cover"
                  unoptimized
                />
              </div>
              <h1 className="w-full text-2xl font-bold text-slate-900 dark:text-slate-100">
                Bem vindo ao Conectado em Concursos
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {subtitles[mode]}
              </p>
            </div>

            <div
              className="overflow-hidden"
              style={{
                height: containerHeight === "auto" ? undefined : containerHeight,
                transition: "height 300ms ease",
              }}
            >
              <div
                className="flex items-start transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${MODE_INDEX[mode] * 100}%)` }}
              >
                <section
                  ref={(el) => {
                    panelRefs.current[0] = el;
                  }}
                  aria-hidden={mode !== "login"}
                  inert={mode === "register" || mode === "forgot"}
                  className="w-full shrink-0"
                >
                  {googleButton}
                  <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ou</span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>
                  {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
                      {error}
                    </div>
                  )}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void loginEmail();
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        E-mail
                      </label>
                      <div className={inputShell}>
                        <MailIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <input
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className={inputField}
                          placeholder="seu_email@example.com"
                          type="email"
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Senha
                      </label>
                      <div className={inputShell}>
                        <LockIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <input
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className={inputField}
                          placeholder="••••••••"
                          type="password"
                          autoComplete="current-password"
                          required
                        />
                      </div>
                    </div>
                    <button
                      disabled={loading}
                      className="h-10 w-full rounded-lg bg-blue-900 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                    >
                      {loading ? "Entrando..." : "Entrar"}
                    </button>
                  </form>
                  <div className="mt-6 flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-slate-600 transition hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      Esqueceu sua senha?
                    </button>
                    <div className="text-slate-600 dark:text-slate-400">
                      Não tem conta?{" "}
                      <button
                        type="button"
                        onClick={() => setMode("register")}
                        className="font-semibold text-slate-900 hover:underline dark:text-slate-100"
                      >
                        Cadastre-se
                      </button>
                    </div>
                  </div>
                </section>

                <section
                  ref={(el) => {
                    panelRefs.current[1] = el;
                  }}
                  aria-hidden={mode !== "register"}
                  inert={mode === "login" || mode === "forgot"}
                  className="w-full shrink-0"
                >
                  {googleButton}
                  <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ou cadastre-se com e-mail</span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>

                  {globalErrors.length > 0 && (
                    <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/40 p-4">
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

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        E-mail
                      </label>
                      <div className={inputShell}>
                        <MailIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
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
                          className={inputField}
                          placeholder="voce@exemplo.com"
                          type="email"
                          autoComplete="email"
                        />
                      </div>
                      {fieldErrors.email?.length ? (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.email.join(" ")}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Nome de usuário
                      </label>
                      <div className={inputShell}>
                        <UserIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <input
                          value={username}
                          onChange={(e) => {
                            const v = sanitizeUsername(e.target.value);
                            setUsername(v);
                            setUsernameDirty(v.length > 0);
                          }}
                          className={inputField}
                          placeholder="seu_usuario"
                          type="text"
                          autoComplete="username"
                        />
                      </div>
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
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Senha
                      </label>
                      <div className={inputShell}>
                        <LockIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <input
                          value={password1}
                          onChange={(e) => setPassword1(e.target.value)}
                          className={inputField}
                          placeholder="••••••••"
                          type="password"
                          autoComplete="new-password"
                        />
                      </div>
                      {fieldErrors.password1?.length ? (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.password1.join(" ")}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Confirmar senha
                      </label>
                      <div className={inputShell}>
                        <LockIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <input
                          value={password2}
                          onChange={(e) => setPassword2(e.target.value)}
                          className={inputField}
                          placeholder="••••••••"
                          type="password"
                          autoComplete="new-password"
                        />
                      </div>
                      {fieldErrors.password2?.length ? (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.password2.join(" ")}
                        </p>
                      ) : null}
                    </div>

                    <PasswordChecklist password={password1} confirm={password2} />

                    <button
                      onClick={submitRegister}
                      disabled={registerLoading || !canSubmit}
                      className="h-10 w-full rounded-lg bg-blue-900 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                    >
                      {registerLoading ? "Criando conta..." : "Criar conta"}
                    </button>
                  </div>

                  <div className="mt-6 text-sm text-slate-600 dark:text-slate-400">
                    Já tem conta?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="font-semibold text-slate-900 hover:underline dark:text-slate-100"
                    >
                      Entrar
                    </button>
                  </div>
                </section>

                <section
                  ref={(el) => {
                    panelRefs.current[2] = el;
                  }}
                  aria-hidden={mode !== "forgot"}
                  inert={mode === "login" || mode === "register"}
                  className="w-full shrink-0"
                >
                  {resetSent ? (
                    <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Se esse e-mail existir, você receberá um link de redefinição.
                    </div>
                  ) : (
                    <div className="mt-6 space-y-3">
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          E-mail
                        </label>
                        <div className={inputShell}>
                          <MailIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                          <input
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className={inputField}
                            placeholder="seu_email@example.com"
                            type="email"
                            autoComplete="email"
                          />
                        </div>
                      </div>
                      <button
                        onClick={sendReset}
                        disabled={resetLoading}
                        className="h-10 w-full rounded-lg bg-blue-900 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                      >
                        {resetLoading ? "Enviando..." : "Enviar link"}
                      </button>
                    </div>
                  )}

                  <div className="mt-6 text-sm">
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="text-slate-600 dark:text-slate-400 hover:underline"
                    >
                      Voltar para o login
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}