"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, MailCheck, Save, Send } from "lucide-react";
import { smtpSettings, type SMTPSettings } from "@/lib/backoffice";
import { adminError } from "@/components/admin/useAdminListing";

const initial: SMTPSettings = { source: "admin", configured: false, enabled: true, host: "", port: 587, username: "", has_password: false, use_tls: true, use_ssl: false, from_email: "" };

export default function SMTPSettingsPage() {
  const [settings, setSettings] = useState(initial);
  const [password, setPassword] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void smtpSettings.get().then((data) => { setSettings(data); setTestEmail(data.from_email); }).catch((err) => setError(adminError(err, "Não foi possível carregar a configuração SMTP."))).finally(() => setLoading(false)); }, []);
  const set = <K extends keyof SMTPSettings>(key: K, value: SMTPSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const data = await smtpSettings.save({ ...settings, password: password || undefined }); setSettings(data); setPassword(""); setNotice("Configuração SMTP salva com segurança."); }
    catch (err) { setError(adminError(err, "Não foi possível salvar a configuração SMTP.")); }
    finally { setBusy(false); }
  }
  async function sendTest() {
    setBusy(true); setError(""); setNotice("");
    try { const data = await smtpSettings.test(testEmail); setNotice(data.detail); }
    catch (err) { setError(adminError(err, "Não foi possível enviar o e-mail de teste.")); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  return <main className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-2xl font-bold">E-mail transacional (SMTP)</h1><p className="mt-1 text-sm text-slate-500">Usado para recuperação de senha e comunicações da plataforma.</p></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}<form onSubmit={save} className="space-y-5 rounded-xl border bg-white p-5 dark:bg-slate-900"><div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-100"><MailCheck className="mt-0.5 h-5 w-5 shrink-0"/><p>{settings.source === "environment" ? "Nenhuma configuração do painel foi salva. Ao salvar, ela passa a substituir o SMTP definido no ambiente." : "A configuração do painel está ativa. A senha nunca é exibida novamente."}</p></div><div className="grid gap-4 sm:grid-cols-[1fr_8rem]"><label className="text-sm font-medium">Servidor SMTP<input required value={settings.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.exemplo.com" className="mt-1 h-10 w-full rounded-md border bg-transparent px-3"/></label><label className="text-sm font-medium">Porta<input required type="number" min="1" max="65535" value={settings.port} onChange={(e) => set("port", Number(e.target.value))} className="mt-1 h-10 w-full rounded-md border bg-transparent px-3"/></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Usuário<input value={settings.username} onChange={(e) => set("username", e.target.value)} autoComplete="username" className="mt-1 h-10 w-full rounded-md border bg-transparent px-3"/></label><label className="text-sm font-medium">Senha ou chave de app<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings.has_password ? "Deixe em branco para manter a atual" : "Informe a senha"} autoComplete="new-password" className="mt-1 h-10 w-full rounded-md border bg-transparent px-3"/></label></div><label className="block text-sm font-medium">E-mail remetente<input required type="email" value={settings.from_email} onChange={(e) => set("from_email", e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-transparent px-3"/></label><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={settings.enabled} onChange={(e) => set("enabled", e.target.checked)}/>Usar esta configuração</label><label className="flex items-center gap-2"><input type="checkbox" checked={settings.use_tls} onChange={(e) => { set("use_tls", e.target.checked); if (e.target.checked) set("use_ssl", false); }}/>TLS (recomendado)</label><label className="flex items-center gap-2"><input type="checkbox" checked={settings.use_ssl} onChange={(e) => { set("use_ssl", e.target.checked); if (e.target.checked) set("use_tls", false); }}/>SSL</label></div><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60"><Save size={16}/>Salvar SMTP</button></form><section className="rounded-xl border bg-white p-5 dark:bg-slate-900"><h2 className="font-semibold">Testar entrega</h2><p className="mt-1 text-sm text-slate-500">Salve a configuração antes de testar.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="destinatario@exemplo.com" className="h-10 flex-1 rounded-md border bg-transparent px-3"/><button type="button" disabled={busy || !testEmail} onClick={() => void sendTest()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-blue-200 px-4 text-sm font-semibold text-blue-700 disabled:opacity-60"><Send size={16}/>Enviar teste</button></div></section></main>;
}
