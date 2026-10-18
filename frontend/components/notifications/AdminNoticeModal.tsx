"use client";

import { NoticeContent } from "./NoticeContent";
import { useEffect, useState } from "react";
import { http } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Notice = { id:number; recipient_id:number; title:string; summary:string; body:string; priority:string; image_url:string; video_url:string; links:{label:string;url:string}[]; postpone_hours:number; max_postpones:number; postpone_count:number };

export function AdminNoticeModal() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { try { const response = await http.get<{notification:Notice | null}>("/api/admin-notices/next/"); setNotice(response.data.notification); } catch { /* aviso não impede o uso do sistema */ } };
  useEffect(() => { void load(); }, []);
  const act = async (action:"confirm"|"postpone") => { if (!notice || busy) return; setBusy(true); setError(""); try { await http.post(`/api/admin-notices/${notice.recipient_id}/${action}/`, {}); setNotice(null); } catch { setError("Não foi possível registrar sua ação. Tente novamente."); } finally { setBusy(false); } };
  const required = notice?.priority === "required";
  return <Dialog open={Boolean(notice)} onOpenChange={(open) => { if (open || !required) setNotice(open ? notice : null); }}>
    <DialogContent className="max-w-lg" onPointerDownOutside={(event) => { if (required) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (required) event.preventDefault(); }}>
      {notice && <><DialogHeader><DialogTitle>{notice.title}</DialogTitle>{notice.summary && <DialogDescription>{notice.summary}</DialogDescription>}</DialogHeader>
        <NoticeContent {...notice} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {notice.postpone_count >= notice.max_postpones && <p className="text-sm">Limite de adiamentos atingido. Confirme a visualização para concluir.</p>}
        <DialogFooter><Button variant="outline" onClick={() => void act("postpone")} disabled={busy || notice.postpone_count >= notice.max_postpones}>Ver mais tarde</Button><Button onClick={() => void act("confirm")} disabled={busy}>Confirmar visualização</Button></DialogFooter></>}
    </DialogContent>
  </Dialog>;
}
