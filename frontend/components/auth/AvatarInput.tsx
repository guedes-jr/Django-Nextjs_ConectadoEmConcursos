"use client";

import { useEffect, useMemo, useState } from "react";

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

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
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
        </div>

        <label className="absolute -bottom-2 left-1/2 -translate-x-1/2 cursor-pointer">
          <div className="h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow border-2 border-white dark:border-slate-900">
            📷
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              onChange(file);
            }}
          />
        </label>
      </div>

      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Foto de perfil
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400">
          PNG/JPG. Você pode trocar depois.
        </div>
      </div>
    </div>
  );
}