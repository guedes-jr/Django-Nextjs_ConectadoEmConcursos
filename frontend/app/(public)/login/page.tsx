"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { http } from "@/lib/http";

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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      await http.post("/api/auth/login/", { email, password });
      router.push("/dashboard");
    } catch {
      setError("E-mail ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  };

  const loginGoogle = () => {
    window.location.href = "http://localhost:8000/accounts/google/login/";
  };

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
        <div className="w-full max-w-md">
          <div className="rounded-2xl border-2 border-gray-300 bg-white p-8 shadow-xl">
            <div className="text-center">
              <div className="mx-auto flex h-35 w-35 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/logos/logo.png"
                  alt="Logo"
                  width={80}
                  height={80}
                  className="object-cover"
                />
              </div>
              <h1 className="mt-6 text-2xl font-bold text-gray-900">
                Bem vindo ao Conectado em Concursos
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Acesse para continuar
              </p>
            </div>

            <button
              onClick={loginGoogle}
              className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-[0.98]"
              type="button"
            >
              <span className="text-lg font-bold text-[#4285F4]">G</span>
              Continue com sua conta Google
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium text-gray-500">OR</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                <label className="text-sm font-medium text-gray-700">
                  E-mail
                </label>
                <div className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 shadow-sm transition focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-blue-500">
                  <MailIcon className="h-5 w-5 text-gray-400" />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-full w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                    placeholder="seu_email@example.com"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Senha
                </label>
                <div className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 shadow-sm transition focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-blue-500">
                  <LockIcon className="h-5 w-5 text-gray-400" />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-full w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
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
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between text-sm">
              <Link
                href="/forgot-password"
                className="text-gray-600 transition hover:text-gray-900 hover:underline"
              >
                Esqueceu sua senha?
              </Link>
              <div className="text-gray-600">
                Não tem conta?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-gray-900 hover:underline"
                >
                  Cadastre-se
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
