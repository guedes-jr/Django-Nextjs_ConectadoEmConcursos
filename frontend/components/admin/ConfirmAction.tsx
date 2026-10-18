import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export function ConfirmAction({open, title, description, busy, error, onClose, onConfirm}: {open:boolean;title:string;description:string;busy:boolean;error?:string|null;onClose:()=>void;onConfirm:()=>void}) {
  return <Dialog open={open} onOpenChange={value => {if (!value && !busy) onClose();}}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={onConfirm}>{busy ? "Aguarde..." : "Confirmar"}</Button></DialogFooter></DialogContent></Dialog>;
}
