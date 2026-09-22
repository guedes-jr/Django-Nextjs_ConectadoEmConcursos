"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { http } from "@/lib/http";

function ResetForm() {
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) return setError("As senhas não coincidem.");
    setLoading(true);
    try {
      const response = await http.post<{ detail: string }>("/api/password/reset/confirm/", { uid, token, new_password: password });
      setMessage(response.data.detail);
    } catch {
      setError("O link expirou ou a senha não atende aos requisitos de segurança.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-bold">Criar nova senha</h1>
        {!uid || !token ? <p className="mt-5 text-red-600">Link de redefinição inválido.</p> : message ? (
          <div className="mt-5"><p className="text-green-600">{message}</p><Link className="mt-4 inline-block text-blue-600 hover:underline" href="/">Entrar</Link></div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm">Nova senha<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700" /></label>
            <label className="block text-sm">Confirmar senha<input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700" /></label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button disabled={loading} className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white disabled:opacity-60">{loading ? "Salvando…" : "Redefinir senha"}</button>
          </form>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>;
}
