"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

const LABELS: Record<string, string> = {
  light: "Modo claro",
  dark: "Modo escuro",
  system: "Seguir sistema",
};

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="h-8 w-8 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      aria-label={`Alternar tema (${LABELS[theme]})`}
      title={`${LABELS[theme]} — clique para alternar`}
    >
      {theme === "dark" ? "🌙" : theme === "system" ? "🖥️" : "☀️"}
    </button>
  );
}