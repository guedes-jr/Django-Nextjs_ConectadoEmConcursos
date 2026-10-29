"use client";

import { Pause, Play, RotateCcw, Settings2, Timer } from "lucide-react";
import { useEffect, useState } from "react";

type State = { endsAt: number; duration: number; running: boolean };
const key = "study-timer";

export function GlobalTimer() {
  const [state, setState] = useState<State | null>(null);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(25);
  useEffect(() => { const load = () => { const raw = sessionStorage.getItem(key); setState(raw ? JSON.parse(raw) : null); }; load(); addEventListener("study-timer", load); return () => removeEventListener("study-timer", load); }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = state ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0;
  const save = (next: State | null) => { if (next) sessionStorage.setItem(key, JSON.stringify(next)); else sessionStorage.removeItem(key); setState(next); dispatchEvent(new Event("study-timer")); };
  if (!state) return null;
  if (!left && state.running) return <div className="fixed right-4 top-20 z-[130] rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900"><p className="font-semibold">Tempo encerrado</p><div className="mt-3 flex gap-2"><button className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => save({duration: state.duration, endsAt: Date.now() + state.duration * 1000, running:true})}>Reiniciar</button><button className="rounded border px-3 py-2" onClick={() => setOpen(true)}>Novo tempo</button></div></div>;
  return <><div className="fixed right-4 top-3 z-[130] flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white shadow-lg"><Timer size={16}/>{String(Math.floor(left/60)).padStart(2,"0")}:{String(left%60).padStart(2,"0")}<button onClick={() => save({...state, running: !state.running, endsAt: state.running ? state.endsAt : Date.now()+left*1000})}>{state.running?<Pause size={16}/>:<Play size={16}/>}</button><button onClick={() => save({duration:state.duration,endsAt:Date.now()+state.duration*1000,running:false})}><RotateCcw size={16}/></button><button onClick={()=>setOpen(true)}><Settings2 size={16}/></button></div>{open&&<div className="fixed inset-0 z-[140] grid place-items-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-slate-900"><h2 className="font-bold">Cronômetro de estudos</h2><label className="mt-4 block text-sm">Minutos<input type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(Number(e.target.value))} className="mt-1 w-full rounded border p-2"/></label><button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white" onClick={()=>{save({duration:minutes*60,endsAt:Date.now()+minutes*60000,running:true});setOpen(false)}}>Iniciar novo tempo</button></div></div>}</>;
}
