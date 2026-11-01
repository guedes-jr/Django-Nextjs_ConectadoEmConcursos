"use client";

import { FormEvent, useEffect, useState } from "react";
import { http } from "@/lib/http";
import { adminError } from "@/components/admin/useAdminListing";

type Configuration = { source: string; gateway: "efi" | "stripe"; enabled: boolean; sandbox: boolean; notification_url: string; has_client_id: boolean; has_client_secret: boolean };
const initial: Configuration = { source: "environment", gateway: "efi", enabled: false, sandbox: true, notification_url: "", has_client_id: false, has_client_secret: false };
const endpoint = "/api/backoffice/settings/payments/";
const inputClass = "mt-1 block h-11 w-full min-w-0 rounded-lg border bg-transparent px-3";

export default function PaymentSettingsPage() {
  const [config, setConfig] = useState(initial);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { http.get<Configuration>(endpoint).then(({ data }) => { setConfig(data); setLoaded(true); }).catch(err => setError(adminError(err, "Não foi possível carregar as integrações de pagamento."))).finally(() => setLoading(false)); }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { data } = await http.put<Configuration>(endpoint, {
        gateway: config.gateway, enabled: config.enabled, sandbox: config.sandbox,
        notification_url: config.notification_url,
        ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
        ...(secret.trim() ? { client_secret: secret.trim() } : {}),
      });
      setConfig(data); setClientId(""); setSecret(""); setMessage("Configuração salva. Teste a conexão para conferir as credenciais.");
    } catch (err) { setError(adminError(err, "Não foi possível salvar a integração.")); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setError(""); setMessage("");
    try { const { data } = await http.post<{ detail: string }>(endpoint + "test/"); setMessage(data.detail); }
    catch (err) { setError(adminError(err, "Não foi possível conectar à Efí.")); }
    finally { setBusy(false); }
  }

  if (loading) return <p role="status">Carregando integrações de pagamento...</p>;
  return <main className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
    <header><h1 className="text-2xl font-bold">Integrações de pagamento</h1><p className="mt-2 text-sm text-slate-500">Gerencie o recebimento dos planos. Acesso restrito a superadministradores.</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    {loaded && <form onSubmit={save} className="min-w-0 space-y-5 rounded-xl border bg-white p-5 dark:bg-slate-900">
      <p className="text-sm text-slate-500">Origem: {config.source === "admin" ? "configuração do painel" : "variáveis de ambiente"}. Credenciais salvas são criptografadas e não voltam a ser exibidas.</p>
      <label htmlFor="payment-provider" className="block text-sm font-medium">Provedor para novas compras</label><select id="payment-provider" value={config.gateway} onChange={e => setConfig({ ...config, gateway: e.target.value as Configuration["gateway"] })} className={inputClass}><option value="efi">Efí / Gerencianet</option><option value="stripe">Stripe (configurada pelo ambiente)</option></select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })}/>Habilitar novas cobranças</label>
      <fieldset className="min-w-0 space-y-4 rounded-lg border p-4"><legend className="px-2 font-semibold">Efí — Pix, boleto e cartão</legend>
        <label htmlFor="payment-environment" className="block text-sm font-medium">Ambiente</label><select id="payment-environment" value={config.sandbox ? "sandbox" : "production"} onChange={e => setConfig({ ...config, sandbox: e.target.value === "sandbox" })} className={inputClass}><option value="sandbox">Homologação</option><option value="production">Produção</option></select>
        <p className="text-xs text-slate-500">Use credenciais da API Cobranças do ambiente selecionado. Homologação permite testar a conexão; compras de teste são aceitas apenas no ambiente de desenvolvimento.</p>
        <label className="block text-sm font-medium">Client ID<input type="password" autoComplete="new-password" maxLength={512} value={clientId} onChange={e => setClientId(e.target.value)} placeholder={config.has_client_id ? "Salvo — deixe em branco para manter" : "Informe o Client ID"} className={inputClass}/></label>
        <label className="block text-sm font-medium">Client Secret<input type="password" autoComplete="new-password" maxLength={1024} value={secret} onChange={e => setSecret(e.target.value)} placeholder={config.has_client_secret ? "Salvo — deixe em branco para manter" : "Informe o Client Secret"} className={inputClass}/></label>
        <label className="block text-sm font-medium">URL pública de notificação<input type="url" maxLength={600} value={config.notification_url} onChange={e => setConfig({ ...config, notification_url: e.target.value })} placeholder="https://seu-dominio/api/billing/efi/notifications/" className={inputClass}/></label>
        <p className="text-xs text-slate-500">Use a URL HTTPS pública do backend terminando em /api/billing/efi/notifications/.</p>
        <p className="text-sm">O pagamento ocorre na página da Efí. Pix é oferecido pelo Bolix e precisa estar habilitado na conta. Cartões dependem da liberação da Efí. Este checkout não utiliza o certificado da API Pix direta.</p>
        <p className="text-sm">Cada compra paga um período mensal, semestral ou anual. Não há renovação automática.</p>
      </fieldset>
      <div className="flex flex-wrap gap-3"><button disabled={busy} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Salvar configuração</button><button type="button" disabled={busy || !config.has_client_id || !config.has_client_secret} onClick={() => void test()} className="min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">Testar conexão Efí salva</button></div>
      <p className="text-xs text-slate-500">O teste autentica na Efí sem criar cobranças. Salve as alterações antes de testar.</p>
    </form>}
  </main>;
}
