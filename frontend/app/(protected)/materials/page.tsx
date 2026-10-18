"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteStudyMaterial, listStudyMaterials, StudyMaterial } from "@/lib/chat";

export default function MaterialsPage() {
  const [items, setItems] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  useEffect(() => {
    void listStudyMaterials().then(setItems).catch(() => setError("Não foi possível carregar seus materiais.")).finally(() => setLoading(false));
  }, []);
  async function remove(id: number) {
    if (!window.confirm("Excluir este material da biblioteca?")) return;
    setDeletingId(id);
    try { await deleteStudyMaterial(id); setItems((current) => current.filter((item) => item.id !== id)); }
    catch { setError("Não foi possível excluir o material."); }
    finally { setDeletingId(null); }
  }
  return <main className="mx-auto max-w-4xl space-y-5 p-5">
    <h1 className="text-2xl font-bold">Biblioteca de materiais</h1>
    <p className="text-sm text-slate-500">Suas respostas salvas do assistente, com as questões de referência. Conteúdo gerado por IA pode conter erros; confira os comentários cadastrados.</p>
    <Link href="/chatIA" className="text-blue-600 underline">Abrir assistente de estudos</Link>
    {loading && <p>Carregando materiais…</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!loading && !error && !items.length && <p>Você ainda não salvou materiais. Use “Salvar material” em uma resposta do assistente.</p>}
    {items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
      <h2 className="mb-3 font-semibold">{item.title}</h2>
      <p className="whitespace-pre-wrap text-sm">{item.message.content}</p>
      {!!item.message.sources?.length && <details className="mt-4 text-sm"><summary className="cursor-pointer">Questões de referência</summary>{item.message.sources.map((source) => <p key={source.id} className="mt-2">[Q{source.id}] {source.discipline} · {source.banca} · {source.year}: {source.statement}</p>)}</details>}
      <button disabled={deletingId === item.id} onClick={() => void remove(item.id)} className="mt-4 text-sm text-red-600 underline disabled:opacity-50">Excluir material</button>
    </article>)}
  </main>;
}
