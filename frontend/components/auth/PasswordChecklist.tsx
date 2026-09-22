"use client";

type Props = {
  password: string;
  confirm?: string;
};

function hasLower(s: string) {
  return /[a-z]/.test(s);
}

function hasUpper(s: string) {
  return /[A-Z]/.test(s);
}

function hasNumber(s: string) {
  return /[0-9]/.test(s);
}

function hasSymbol(s: string) {
  return /[^A-Za-z0-9]/.test(s);
}

function notOnlyNumbers(s: string) {
  return !/^\d+$/.test(s);
}

function minLength(s: string, n: number) {
  return s.length >= n;
}

function Item({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
          ok
            ? "bg-green-600 border-green-600 text-white"
            : "bg-transparent border-slate-300 dark:border-slate-700 text-slate-400"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      <span className={ok ? "text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}>
        {label}
      </span>
    </div>
  );
}

export function PasswordChecklist({ password, confirm }: Props) {
  const rules = [
    { ok: minLength(password, 8), label: "Mínimo de 8 caracteres" },
    { ok: hasLower(password), label: "Pelo menos 1 letra minúscula" },
    { ok: hasUpper(password), label: "Pelo menos 1 letra maiúscula" },
    { ok: hasNumber(password), label: "Pelo menos 1 número" },
    { ok: hasSymbol(password), label: "Pelo menos 1 símbolo (ex: !@#)" },
    { ok: password.length === 0 ? false : notOnlyNumbers(password), label: "Não pode conter apenas números" },
  ];

  const confirmOk =
    typeof confirm === "string" ? password.length > 0 && password === confirm : null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
      <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        Requisitos de senha (compatível com Django)
      </div>

      <div className="space-y-1">
        {rules.map((r) => (
          <Item key={r.label} ok={r.ok} label={r.label} />
        ))}

        {confirmOk !== null && (
          <Item ok={confirmOk} label="As senhas conferem" />
        )}
      </div>

      <div className="pt-2 text-xs text-slate-500 dark:text-slate-400">
        Obs.: o Django ainda pode rejeitar por “senha muito comum” ou parecida com seu e-mail/nome.
      </div>
    </div>
  );
}
