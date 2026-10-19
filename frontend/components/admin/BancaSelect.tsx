"use client";
import {useEffect,useState} from "react";
import {bancaOptions,type BancaOption} from "@/lib/backoffice";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {AdminFilterSelect} from "@/components/admin/ListControls";

export function BancaSelect({id,label="Banca organizadora",value,onChange,disabled=false,emptyLabel="Não informada",legacyText}: {id:string;label?:string;value:string;onChange:(value:string)=>void;disabled?:boolean;emptyLabel?:string;legacyText?:string}) {
 const [rows,setRows]=useState<BancaOption[]>([]);
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let cancelled=false;setLoading(true);void bancaOptions().then(result=>{if(!cancelled){setRows(result);setError(false);}}).catch(()=>{if(!cancelled)setError(true);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[attempt]);
 const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
 const filtered=rows.filter(row=>String(row.id)===value || ((row.is_active || disabled) && normalize([row.name,...row.aliases].join(" ")).includes(normalize(search))));
 return <div className="space-y-2"><Label htmlFor={`${id}-search`}>Pesquisar banca por nome ou sigla</Label><Input id={`${id}-search`} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Ex.: FCC, Carlos Chagas" disabled={disabled||loading}/><AdminFilterSelect id={id} label={label} value={value} onChange={onChange} disabled={disabled||loading||error} options={[["all",loading?"Carregando bancas…":emptyLabel],...filtered.map(row=>[String(row.id),`${row.name}${row.is_active?"":" (inativa)"}`] as [string,string]),...(value&&!rows.some(row=>String(row.id)===value)?[[value,legacyText||`Banca #${value}`] as [string,string]]:[])]}/>{legacyText&&<p className="text-xs text-slate-500">Identificação histórica: {legacyText}</p>}{!loading&&!error&&!rows.length&&<p className="text-xs text-amber-700">Catálogo vazio. Cadastre as bancas em Administração → Bancas.</p>}{error&&<p role="alert" className="text-sm text-rose-600">Não foi possível carregar as bancas. <Button type="button" size="sm" variant="ghost" onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</Button></p>}</div>;
}
