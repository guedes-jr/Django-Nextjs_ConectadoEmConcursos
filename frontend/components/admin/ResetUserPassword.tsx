"use client";

import {FormEvent,useRef,useState} from "react";
import {KeyRound} from "lucide-react";
import {backoffice} from "@/lib/backoffice";
import {adminError} from "@/components/admin/useAdminListing";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";

export function ResetUserPassword({user,onSuccess,disabled=false}:{user:{id:number;username:string};onSuccess:()=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[reason,setReason]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const locked=useRef(false);
 const clear=()=>{setPassword("");setConfirmation("");setReason("");setError("");};
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(locked.current)return;
  if(password!==confirmation){setError("As senhas não coincidem.");return;}
  locked.current=true;setBusy(true);setError("");
  try{
   const result=await backoffice.resetUserPassword(user.id,{new_password:password,confirmation,reason});
   clear();setOpen(false);
   if(result.reauthenticate){window.location.assign("/login?next=/admin/usuarios");return;}
   onSuccess();
  }catch(err){setPassword("");setConfirmation("");setError(adminError(err,"Não foi possível redefinir a senha."));}
  finally{locked.current=false;setBusy(false);}
 };
 return <><Button variant="outline" size="sm" disabled={disabled||busy} onClick={()=>{clear();setOpen(true);}} aria-label={`Redefinir senha de ${user.username}`}><KeyRound size={16}/>Redefinir senha</Button><Dialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);if(!value)clear();}}}><DialogContent><DialogHeader><DialogTitle>Redefinir senha</DialogTitle><DialogDescription>Defina uma nova senha para {user.username}. A alteração é imediata, encerra os acessos anteriores e não envia e-mail. Combine a entrega da senha com o usuário.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<div className="space-y-2"><Label htmlFor={`password-${user.id}`}>Nova senha</Label><Input id={`password-${user.id}`} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={4096} disabled={busy}/></div><div className="space-y-2"><Label htmlFor={`confirmation-${user.id}`}>Confirmar nova senha</Label><Input id={`confirmation-${user.id}`} type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required maxLength={4096} disabled={busy}/></div><div className="space-y-2"><Label htmlFor={`reason-${user.id}`}>Motivo da redefinição</Label><Input id={`reason-${user.id}`} value={reason} onChange={e=>setReason(e.target.value)} required maxLength={500} disabled={busy}/></div><p className="text-xs text-slate-500">A senha deve atender à política da plataforma. Apenas o motivo e a ação ficam no histórico administrativo.</p><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>{clear();setOpen(false);}}>Cancelar</Button><Button type="submit" disabled={busy}>{busy?"Redefinindo...":"Salvar nova senha"}</Button></DialogFooter></form></DialogContent></Dialog></>;
}
