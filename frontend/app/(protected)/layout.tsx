import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackToTop } from "@/components/layout/BackToTop";
import { FloatingThemeButton } from "@/components/layout/FloatingThemeButton";
import "@excalidraw/excalidraw/index.css";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthLayout>
      <AppHeader />
      {children}
      <footer className="mt-10 border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"><div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-5 gap-y-2"><span>© 2026 Conectado em Concursos</span><Link href="/privacidade" className="hover:text-blue-600 dark:hover:text-blue-400">Política de Privacidade</Link><Link href="/termos-de-uso" className="hover:text-blue-600 dark:hover:text-blue-400">Termos de Uso</Link></div></footer>
      <BackToTop />
      <FloatingThemeButton />
    </AuthLayout>
  );
}
