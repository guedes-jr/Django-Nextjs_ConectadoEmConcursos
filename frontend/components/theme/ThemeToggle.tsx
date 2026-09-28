"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";

const LABELS: Record<string, string> = {
  light: "Modo claro",
  dark: "Modo escuro",
  system: "Seguir sistema",
};

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="fixed bottom-5 right-5 z-[70] grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-white shadow-[0_8px_22px_rgba(37,99,235,0.38)] transition duration-200 hover:scale-105 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-900"
      aria-label={`Alternar tema (${LABELS[theme]})`}
      title={`${LABELS[theme]} — clique para alternar`}
    >
      <Icon size={23} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
