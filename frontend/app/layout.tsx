import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: {
    default: "Conectado em Concursos",
    template: "%s — Conectado em Concursos",
  },
  description:
    "Plataforma de estudos para concursos públicos: questões, simulados, plano de estudos, IA e acompanhamento de concursos e notícias.",
};

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem("cq_theme");
    var isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var html = document.documentElement;
    if (isDark) html.classList.add("dark");
    else html.classList.remove("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-white text-slate-900">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
