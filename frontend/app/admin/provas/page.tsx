"use client";
import { FormEvent, useEffect, useState } from "react";
import { Plus, Eye, EyeOff } from "lucide-react";
import { editorial, EditorialConcurso, EditorialExam } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ProvasPage() {
  const [rows, setRows] = useState<EditorialExam[]>([]); const [concursos, setConcursos] = useState<EditorialConcurso[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [creating, setCreating] = useState(false);
  const load = async () => { setLoading(true); try { const [provas, items] = await Promise.all([editorial.listExams(), editorial.listConcursos()]); setRows(provas.results); setConcursos(items.results); } catch { setError("Não foi possível carregar as provas."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const f = new FormData(event.currentTarget); try { await editorial.createExam({ title: String(f.get("title")), banca: String(f.get("banca")), year: Number(f.get("year")), institution: String(f.get("institution")), concurso: f.get("concurso") ? Number(f.get("concurso")) : null }); setCreating(false); void load(); } catch { setError("Revise título, banca e ano antes de salvar."); } };
  const publish = async (row: EditorialExam) => { try { await editorial.updateExam(row.id, { is_published: !row.is_published }); void load(); } catch { setError("Não foi possível alterar a publicação."); } };
  return <div className="space-y-6"><PageHeader title="Provas" description="Organize provas, associe-as a concursos e controle sua visibilidade." actions={<Button onClick={() => setCreating(!creating)}><Plus /> Nova prova</Button>} />{error && <Notice kind="error">{error}</Notice>}
    {creating && <Card><CardContent className="p-5"><form className="grid gap-3 sm:grid-cols-2" onSubmit={create}><Input name="title" required placeholder="Título"/><Input name="banca" required placeholder="Banca"/><Input name="year" required type="number" min="1980" max="2100" placeholder="Ano"/><Input name="institution" placeholder="Instituição"/><select name="concurso" className="h-9 rounded-md border bg-transparent px-3 text-sm sm:col-span-2"><option value="">Sem concurso vinculado</option>{concursos.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}</select><div className="sm:col-span-2"><Button type="submit">Cadastrar prova</Button></div></form></CardContent></Card>}
    {loading ? <LoadingState /> : <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Prova</TableHead><TableHead>Concurso</TableHead><TableHead>Questões</TableHead><TableHead>Visibilidade</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState title="Nenhuma prova cadastrada." /></TableCell></TableRow> : rows.map(row => <TableRow key={row.id}><TableCell><p className="font-medium">{row.title}</p><p className="text-xs text-slate-500">{row.banca} · {row.year}</p></TableCell><TableCell>{concursos.find(c => c.id === row.concurso)?.title || "—"}</TableCell><TableCell>{row.questions_count}</TableCell><TableCell>{row.is_published ? "Publicada" : "Rascunho"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => void publish(row)}>{row.is_published ? <><EyeOff /> Ocultar</> : <><Eye /> Publicar</>}</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}</div>;
}
