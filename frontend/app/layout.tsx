import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Conectado em Concursos",
    template: "%s — Conectado em Concursos",
  },
  description:
    "Plataforma de estudos para concursos públicos: questões, simulados, plano de estudos, IA e acompanhamento de concursos e notícias.",
  applicationName: "Conectado em Concursos",
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    title: "Concursos",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#3b82f6" },
  ],
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
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-white text-slate-900" suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <InstallPrompt />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
