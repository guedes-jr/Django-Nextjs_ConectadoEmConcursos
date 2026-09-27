"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Send, Save, ClipboardCheck } from "lucide-react";
import { manualQuestions, ManualQuestion } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ManualQuestionsPage() {
  const [items, setItems] = useState<ManualQuestion[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [saving, setSaving] = useState(false);
  const load = async () => { setLoading(true); try { setItems((await manualQuestions.list()).results); } catch { setError("Não foi possível carregar as questões manuais."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); const data = new FormData(event.currentTarget); const options = String(data.get("options")).split("\n").map(x => x.trim()).filter(Boolean); const correct = Number(data.get("correct_answer")) - 1; try { await manualQuestions.create({ statement: String(data.get("statement")), banca: String(data.get("banca")), discipline: String(data.get("discipline")), year: Number(data.get("year")), options, correct_answer: correct, source_url: String(data.get("source_url")) }); event.currentTarget.reset(); setNotice("Rascunho salvo. Revise-o e envie para a fila quando estiver pronto."); void load(); } catch { setError("Revise os campos: são obrigatórios enunciado, banca, disciplina, ano, alternativas, gabarito e URL de referência."); } finally { setSaving(false); } };
  const submit = async (item: ManualQuestion) => { try { await manualQuestions.submit(item.id); setNotice("Questão enviada à fila de revisão. Ela ainda não está publicada."); void load(); } catch { setError("Não foi possível enviar. Complete ou corrija o rascunho antes de tentar novamente."); } };
  return <div className="space-y-6"><PageHeader title="Questões manuais" description="Cadastre um rascunho e envie-o para a fila. Somente a revisão publica questões." actions={<Button asChild variant="outline"><Link href="/admin/fila-questoes?fonte=manual"><ClipboardCheck /> Abrir fila</Link></Button>} />
    {error && <Notice kind="error">{error}</Notice>}{notice && <Notice kind="success">{notice}</Notice>}
    <Card><CardContent className="p-5"><form onSubmit={save} className="space-y-4"><Textarea name="statement" required placeholder="Enunciado da questão" className="min-h-28"/><div className="grid gap-3 sm:grid-cols-3"><Input name="banca" required placeholder="Banca"/><Input name="discipline" required placeholder="Disciplina"/><Input name="year" type="number" required min="1980" max="2100" placeholder="Ano"/></div><Textarea name="options" required placeholder={"Alternativas, uma por linha\nA) ...\nB) ..."}/><div className="grid gap-3 sm:grid-cols-2"><Input name="correct_answer" type="number" required min="1" placeholder="Número da alternativa correta (1, 2...)"/><Input name="source_url" type="url" required placeholder="URL da prova, edital ou referência oficial"/></div><p className="text-xs text-slate-500">Confirme que possui autorização ou referência adequada para o conteúdo antes de salvá-lo.</p><Button type="submit" disabled={saving}><Save /> {saving ? "Salvando..." : "Salvar rascunho"}</Button></form></CardContent></Card>
    {loading ? <LoadingState /> : <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Questão</TableHead><TableHead>Contexto</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{items.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState title="Nenhum rascunho manual." description="Use o formulário acima para começar." /></TableCell></TableRow> : items.map(item => <TableRow key={item.id}><TableCell className="max-w-md truncate">{item.statement}</TableCell><TableCell>{item.banca} · {item.year}<p className="text-xs text-slate-500">{item.discipline}</p></TableCell><TableCell>{item.status === "draft" ? "Rascunho" : item.status === "pending" ? "Na fila" : item.status}</TableCell><TableCell className="text-right">{(item.status === "draft" || item.status === "rejected") && <Button size="sm" onClick={() => void submit(item)}><Send /> Enviar à fila</Button>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}</div>;
}
