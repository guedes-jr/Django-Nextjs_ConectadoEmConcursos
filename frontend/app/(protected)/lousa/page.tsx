"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, Pencil, Trash2 } from "lucide-react";

import {
  Sketch,
  createSketch,
  deleteSketch,
  getSketch,
  listSketches,
  updateSketch,
} from "@/lib/sketches";


const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function WhiteboardPage() {
  const apiRef = useRef<any>(null);
  const sketchIdRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayload = useRef("");
  const loadingScene = useRef(false);
  const pendingScene = useRef<any>(null);

  const [sketchId, setSketchId] = useState<number | null>(null);
  const [title, setTitle] = useState("Rascunho");
  const [recent, setRecent] = useState<Sketch[]>([]);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [loadingList, setLoadingList] = useState(true);

  const initialData = useMemo(
    () => ({ elements: [], appState: {}, files: {} }),
    []
  );

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await listSketches());
    } finally {
      setLoadingList(false);
    }
  }, []);

  const replaceUrl = (id?: number) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("id", String(id));
    else url.searchParams.delete("id");
    window.history.replaceState({}, "", url.toString());
  };

  const loadSketch = useCallback(async (id: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("idle");
    try {
      const sketch = await getSketch(id);
      loadingScene.current = true;
      sketchIdRef.current = sketch.id;
      setSketchId(sketch.id);
      setTitle(sketch.title || "Rascunho");
      lastPayload.current = JSON.stringify({ title: sketch.title, data: sketch.data });
      replaceUrl(sketch.id);
      pendingScene.current = sketch.data;
      if (apiRef.current) {
        apiRef.current.updateScene(sketch.data);
        pendingScene.current = null;
        window.setTimeout(() => { loadingScene.current = false; }, 0);
      }
    } catch {
      setStatus("error");
      loadingScene.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
    const id = new URLSearchParams(window.location.search).get("id");
    if (id && /^\d+$/.test(id)) void loadSketch(Number(id));
  }, [loadSketch, refreshRecent]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const startNew = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    loadingScene.current = true;
    sketchIdRef.current = null;
    setSketchId(null);
    setTitle("Rascunho");
    setStatus("idle");
    lastPayload.current = "";
    replaceUrl();
    apiRef.current?.resetScene();
    window.setTimeout(() => { loadingScene.current = false; }, 0);
  };

  const queueSave = (data: any) => {
    if (loadingScene.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      const normalizedTitle = title.trim() || "Rascunho";
      const payload = JSON.stringify({ title: normalizedTitle, data });
      if (payload === lastPayload.current) return;

      try {
        setStatus("saving");
        const currentId = sketchIdRef.current;
        if (currentId === null) {
          const created = await createSketch(normalizedTitle, data);
          sketchIdRef.current = created.id;
          setSketchId(created.id);
          replaceUrl(created.id);
        } else {
          await updateSketch(currentId, { title: normalizedTitle, data });
        }
        lastPayload.current = payload;
        setStatus("saved");
        await refreshRecent();
        window.setTimeout(() => setStatus("idle"), 1000);
      } catch {
        setStatus("error");
      }
    }, 600);
  };

  const saveTitle = async () => {
    const id = sketchIdRef.current;
    if (id === null) return;
    try {
      setStatus("saving");
      await updateSketch(id, { title: title.trim() || "Rascunho" });
      setStatus("saved");
      await refreshRecent();
    } catch {
      setStatus("error");
    }
  };

  const removeSketch = async (sketch: Sketch) => {
    if (!window.confirm(`Excluir o rascunho “${sketch.title}”?`)) return;
    await deleteSketch(sketch.id);
    if (sketchIdRef.current === sketch.id) startNew();
    await refreshRecent();
  };

  return (
    <main className="min-h-[calc(100vh-56px)] bg-slate-50 p-4 dark:bg-slate-950">
      <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-semibold text-slate-900 dark:text-slate-100">Meus rascunhos</h1>
              <p className="text-xs text-slate-500">Últimos 10 editados</p>
            </div>
            <button onClick={startNew} title="Novo rascunho" className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700"><FilePlus2 className="h-4 w-4" /></button>
          </div>

          <div className="mt-4 space-y-2">
            {loadingList && <p className="text-sm text-slate-500">Carregando…</p>}
            {recent.map((sketch) => (
              <div key={sketch.id} className={`group flex items-center gap-2 rounded-xl border p-3 ${sketchId === sketch.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-slate-200 dark:border-slate-800"}`}>
                <button onClick={() => void loadSketch(sketch.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">{sketch.title}</span>
                  <span className="block text-xs text-slate-500">{new Date(sketch.updated_at).toLocaleDateString("pt-BR")}</span>
                </button>
                <button onClick={() => void removeSketch(sketch)} title="Excluir" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {!loadingList && recent.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">Comece desenhando na lousa.</p>}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <Pencil className="h-4 w-4 text-slate-400" />
            <input value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void saveTitle()} maxLength={120} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" placeholder="Título" />
            <div role="status" className="w-24 text-right text-sm text-slate-500">
              {status === "saving" && "Salvando…"}
              {status === "saved" && "Salvo ✓"}
              {status === "error" && "Erro ao salvar"}
            </div>
          </div>

          <div className="h-[78vh] w-full">
            <Excalidraw
              initialData={initialData}
              excalidrawAPI={(api: any) => {
                apiRef.current = api;
                if (pendingScene.current) {
                  api.updateScene(pendingScene.current);
                  pendingScene.current = null;
                  window.setTimeout(() => { loadingScene.current = false; }, 0);
                }
              }}
              onChange={(elements: any, appState: any, files: any) => {
                queueSave({ elements, appState, files });
              }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
