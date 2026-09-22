"use client";

import Link from "next/link";
import { useState } from "react";
import { http } from "@/lib/http";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendReset = async () => {
    setLoading(true);
    try {
      await http.post("/api/password/reset/", { email });
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Recuperar senha
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Enviaremos um link para redefinir sua senha
        </p>

        {sent ? (
          <div className="mt-6 text-sm text-green-600 dark:text-green-400">
            Se esse e-mail existir, você receberá um link de redefinição.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div>
              <label className="text-sm text-slate-700 dark:text-slate-300">
                E-mail
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-slate-100"
                type="email"
              />
            </div>

            <button
              onClick={sendReset}
              disabled={loading}
              className="w-full h-11 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-60"
              type="button"
            >
              {loading ? "Enviando..." : "Enviar link"}
            </button>
          </div>
        )}

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
