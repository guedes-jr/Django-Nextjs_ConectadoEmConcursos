"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="h-8 w-8 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      aria-label="Alternar tema"
      title={theme === "dark" ? "Mudar para claro" : "Mudar para escuro"}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
