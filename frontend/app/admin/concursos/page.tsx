"use client";
import { FormEvent, useEffect, useState } from "react";
import { Plus, ArchiveRestore, Archive } from "lucide-react";
import { editorial, EditorialConcurso } from "@/lib/backoffice";
import { PageHeader } from "@/components/admin/PageHeader";
import { Notice, LoadingState, EmptyState } from "@/components/admin/Notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ConcursosPage() {
  const [rows, setRows] = useState<EditorialConcurso[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [creating, setCreating] = useState(false);
  const load = async () => { setLoading(true); try { setRows((await editorial.listConcursos()).results); } catch { setError("Não foi possível carregar os concursos."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await editorial.createConcurso({ title: String(form.get("title")), organization: String(form.get("organization")), state: String(form.get("state")) }); setCreating(false); setNotice("Concurso manual cadastrado."); void load(); } catch { setError("Revise os campos e tente novamente."); } };
  const archive = async (row: EditorialConcurso) => { try { await editorial.updateConcurso(row.id, { editorial_status: row.editorial_status === "archived" ? "published" : "archived" }); void load(); } catch { setError("Não foi possível atualizar o estado editorial."); } };
  return <div className="space-y-6"><PageHeader title="Concursos" description="Cadastre concursos manuais e faça a curadoria segura dos itens importados." actions={<Button onClick={() => setCreating(!creating)}><Plus /> Novo concurso</Button>} />
    {error && <Notice kind="error">{error}</Notice>}{notice && <Notice kind="success">{notice}</Notice>}
    {creating && <Card><CardContent className="p-5"><form className="grid gap-3 sm:grid-cols-3" onSubmit={create}><Input name="title" required placeholder="Título do concurso" /><Input name="organization" placeholder="Órgão" /><Input name="state" maxLength={2} placeholder="UF" /><div className="sm:col-span-3"><Button type="submit">Cadastrar como manual</Button></div></form></CardContent></Card>}
    {loading ? <LoadingState /> : <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Concurso</TableHead><TableHead>Origem</TableHead><TableHead>Provas</TableHead><TableHead>Estado editorial</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState title="Nenhum concurso cadastrado." /></TableCell></TableRow> : rows.map(row => <TableRow key={row.id}><TableCell><p className="font-medium">{row.title}</p><p className="text-xs text-slate-500">{row.organization || "Órgão não informado"} {row.state && `· ${row.state}`}</p></TableCell><TableCell>{row.origin === "manual" ? "Manual" : "Importado"}</TableCell><TableCell>{row.exams_count}</TableCell><TableCell>{row.editorial_status === "archived" ? "Arquivado" : "Publicado"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => void archive(row)}>{row.editorial_status === "archived" ? <><ArchiveRestore /> Restaurar</> : <><Archive /> Arquivar</>}</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}</div>;
}
