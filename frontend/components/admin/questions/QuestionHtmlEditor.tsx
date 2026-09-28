"use client";

import { useEffect, useRef } from "react";
import { Bold, ImagePlus, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { value: string; onChange: (value: string) => void; placeholder?: string };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function QuestionHtmlEditor({ value, onChange, placeholder = "Digite o enunciado da questão..." }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editor.current && editor.current.innerHTML !== value) editor.current.innerHTML = value; }, [value]);
  const command = (name: string, argument?: string) => { editor.current?.focus(); document.execCommand(name, false, argument); onChange(editor.current?.innerHTML || ""); };
  const addLink = () => { const url = window.prompt("URL do link (https://)"); if (url && /^https?:\/\//i.test(url)) command("createLink", url); };
  const addImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|gif|webp)$/)) { window.alert("Use uma imagem PNG, JPEG, GIF ou WebP."); return; }
    if (file.size > MAX_IMAGE_BYTES) { window.alert("A imagem deve ter no máximo 2 MB."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    command("insertImage", dataUrl);
    if (input.current) input.current.value = "";
  };
  return <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950">
    <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900" role="toolbar" aria-label="Ferramentas do editor">
      {[ [Bold, "bold", "Negrito"], [Italic, "italic", "Itálico"], [Underline, "underline", "Sublinhado"], [List, "insertUnorderedList", "Lista"], [ListOrdered, "insertOrderedList", "Lista numerada"] ].map(([Icon, action, label]: any) => <Button key={action} type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => command(action)} title={label} aria-label={label}><Icon className="h-4 w-4" /></Button>)}
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={addLink} title="Inserir link" aria-label="Inserir link"><Link2 className="h-4 w-4" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-emerald-700 hover:text-emerald-800" onClick={() => input.current?.click()} title="Inserir imagem" aria-label="Inserir imagem"><ImagePlus className="h-4 w-4" /></Button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => void addImage(event.target.files?.[0])} />
    </div>
    <div ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" onInput={() => onChange(editor.current?.innerHTML || "")} data-placeholder={placeholder} className="min-h-40 px-4 py-3 text-sm leading-6 text-slate-800 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:text-slate-100" />
    <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">Use a barra para formatar. Imagens ficam incorporadas na questão (PNG, JPEG, GIF ou WebP; até 2 MB).</p>
  </div>;
}
