"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { SupportText, supportTexts } from "@/lib/backoffice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SupportTextPanel } from "@/components/SupportTextPanel";

export function SupportTextSelect({value,onChange}:{value:number|null;onChange:(value:number|null)=>void}) {
  const id=useId();
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [rows,setRows]=useState<SupportText[]>([]),[selected,setSelected]=useState<SupportText|null>(null);
  const [count,setCount]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{setLoading(true);setError("");supportTexts.list({search,page:String(page),page_size:"10"}).then(data=>{if(active){setRows(data.results);setCount(data.count);}}).catch(()=>{if(active)setError("Não foi possível carregar os textos.");}).finally(()=>{if(active)setLoading(false);});},200);return()=>{active=false;clearTimeout(timer);};},[search,page,retry]);
  useEffect(()=>{let active=true;if(value===null){setSelected(null);return;}supportTexts.get(value).then(text=>{if(active)setSelected(text);}).catch(()=>{if(active)setError("Não foi possível carregar o texto vinculado.");});return()=>{active=false;};},[value,retry]);
  return <fieldset className="min-w-0 space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Texto de apoio (opcional)</legend>
    <p className="text-xs text-slate-500">Reutilize o mesmo texto em várias questões. <Link href="/admin/textos-apoio" target="_blank" className="underline">Gerenciar textos de apoio</Link></p>
    <label htmlFor={id} className="block text-sm">Pesquisar texto</label><Input id={id} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Título, conteúdo ou referência"/>
    <select aria-label="Texto de apoio vinculado" className="min-h-11 w-full min-w-0 rounded border bg-background p-2 text-sm" value={value??""} onChange={e=>onChange(e.target.value?Number(e.target.value):null)}><option value="">Sem texto de apoio</option>{selected&&!rows.some(row=>row.id===selected.id)&&<option value={selected.id}>#{selected.id} · {selected.title}</option>}{value!==null&&!selected&&!rows.some(row=>row.id===value)&&<option value={value}>Texto #{value}</option>}{rows.map(row=><option key={row.id} value={row.id}>#{row.id} · {row.title}</option>)}</select>
    {loading&&<p role="status" className="text-xs">Carregando textos...</p>}{error&&<p role="alert" className="text-sm text-red-600">{error} <Button type="button" variant="ghost" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</Button></p>}
    <div className="flex flex-wrap items-center gap-2 text-xs"><Button type="button" variant="outline" size="sm" disabled={page===1||loading} onClick={()=>setPage(n=>n-1)}>Anteriores</Button><span>Página {page} · {count} textos</span><Button type="button" variant="outline" size="sm" disabled={page*10>=count||loading} onClick={()=>setPage(n=>n+1)}>Próximos</Button><Button type="button" variant="ghost" size="sm" onClick={()=>setRetry(n=>n+1)}>Atualizar lista</Button></div>
    <SupportTextPanel text={selected}/>
  </fieldset>;
}
