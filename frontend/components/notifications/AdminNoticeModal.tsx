"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { http } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Notice = { id:number; recipient_id:number; title:string; summary:string; body:string; priority:string; image_url:string; video_url:string; links:{label:string;url:string}[]; postpone_hours:number };

export function AdminNoticeModal() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { const response = await http.get<{notification:Notice | null}>("/api/admin-notices/next/"); setNotice(response.data.notification); } catch { /* aviso não impede o uso do sistema */ } };
  useEffect(() => { void load(); }, []);
  const act = async (action:"confirm"|"postpone") => { if (!notice || busy) return; setBusy(true); try { await http.post(`/api/admin-notices/${notice.recipient_id}/${action}/`, {}); setNotice(null); } finally { setBusy(false); } };
  const required = notice?.priority === "required";
  return <Dialog open={Boolean(notice)} onOpenChange={(open) => { if (open || !required) setNotice(open ? notice : null); }}>
    <DialogContent className="max-w-lg" onPointerDownOutside={(event) => { if (required) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (required) event.preventDefault(); }}>
      {notice && <><DialogHeader><DialogTitle>{notice.title}</DialogTitle>{notice.summary && <DialogDescription>{notice.summary}</DialogDescription>}</DialogHeader>
        {notice.image_url && <Image src={notice.image_url} alt="" width={640} height={320} className="max-h-56 w-full rounded object-cover" unoptimized />}
        {notice.video_url && <a className="text-sm underline" href={notice.video_url} target="_blank" rel="noreferrer">Assistir ao vídeo em uma nova aba</a>}
        {notice.body && <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{notice.body}</p>}
        {notice.links?.length > 0 && <div className="flex flex-wrap gap-3">{notice.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="text-sm underline">{link.label}</a>)}</div>}
        <DialogFooter><Button variant="outline" onClick={() => void act("postpone")} disabled={busy}>Ver mais tarde</Button><Button onClick={() => void act("confirm")} disabled={busy}>Confirmar visualização</Button></DialogFooter></>}
    </DialogContent>
  </Dialog>;
}
