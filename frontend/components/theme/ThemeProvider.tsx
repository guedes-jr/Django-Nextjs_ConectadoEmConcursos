"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "cq_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Inicializar tema do localStorage ou do sistema
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    
    if (stored && (stored === "light" || stored === "dark")) {
      setThemeState(stored);
    } else {
      // Se não houver preferência salva, verificar preferência do sistema
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setThemeState(isSystemDark ? "dark" : "light");
    }
    
    setMounted(true);
  }, []);

  // Aplicar tema no DOM
  useEffect(() => {
    if (!mounted) return;

    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }

    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  const value: ThemeContextValue = {
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
