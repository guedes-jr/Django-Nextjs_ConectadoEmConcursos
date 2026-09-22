"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  displayName: string;
  value: File | null;
  onChange: (file: File | null) => void;
};

function getInitials(name: string) {
  const cleaned = (name || "").trim();
  if (!cleaned) return "U";

  const parts = cleaned
    .replace(/[^a-zA-Z0-9\s._-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AvatarInput({ displayName, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(value);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [value]);

  const initials = useMemo(() => getInitials(displayName), [displayName]);

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={openPicker}
        className="relative h-16 w-16 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
        aria-label="Selecionar foto de perfil"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Pré-visualização da foto"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-slate-700 dark:text-slate-200">
            {initials}
          </span>
        )}

        <span className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs border-2 border-white dark:border-slate-900">
          ✎
        </span>
      </button>

      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Foto de perfil
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400">
          PNG/JPG. Você pode trocar depois.
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition"
          >
            {value ? "Alterar" : "Adicionar"}
          </button>

          {value ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Remover
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          onChange(file);
        }}
      />
    </div>
  );
}
