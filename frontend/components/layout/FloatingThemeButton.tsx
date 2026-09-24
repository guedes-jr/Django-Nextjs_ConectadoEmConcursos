"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";

const LABELS: Record<string, string> = {
  light: "Modo claro",
  dark: "Modo escuro",
  system: "Seguir o sistema",
};

export function FloatingThemeButton() {
  const { theme, toggleTheme } = useTheme();

  const Icon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;

  return (
    <button
      type="button"
      aria-label={`Alternar tema (${LABELS[theme]})`}
      title={`${LABELS[theme]} — clique para alternar`}
      onClick={toggleTheme}
      className="fixed bottom-6 right-6 z-[150] grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-white shadow-xl transition-all duration-200 hover:bg-blue-700 active:scale-95"
    >
      <Icon size={22} />
    </button>
  );
}