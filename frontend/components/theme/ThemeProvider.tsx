"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const THEME_ORDER: Theme[] = ["light", "dark", "system"];

type ThemeContextValue = {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "cq_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<Resolved>("light");
  const [mounted, setMounted] = useState(false);

  // Inicializar tema do localStorage (ou seguir o sistema)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
    setMounted(true);
  }, []);

  // Resolver "system" a partir da preferência do sistema operacional
  useEffect(() => {
    if (!mounted) return;
    if (theme !== "system") {
      setResolved(theme);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolved(mq.matches ? "dark" : "light");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [theme, mounted]);

  // Aplicar tema no DOM
  useEffect(() => {
    if (!mounted) return;

    const html = document.documentElement;
    if (resolved === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }

    localStorage.setItem(STORAGE_KEY, theme);
  }, [resolved, theme, mounted]);

  const value: ThemeContextValue = {
    theme,
    resolved,
    setTheme: setThemeState,
    toggleTheme: () =>
      setThemeState((t) => {
        const i = THEME_ORDER.indexOf(t);
        return THEME_ORDER[(i + 1) % THEME_ORDER.length];
      }),
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
