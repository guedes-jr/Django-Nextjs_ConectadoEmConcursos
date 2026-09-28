import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackToTop } from "@/components/layout/BackToTop";
import { AdminNoticeModal } from "@/components/notifications/AdminNoticeModal";
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
      <footer className="border-t border-slate-200 bg-white px-4 pb-6 pt-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"><div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-5 gap-y-2"><span>© 2026 Conectado em Concursos</span><Link href="/privacidade" className="hover:text-blue-600 dark:hover:text-blue-400">Política de Privacidade</Link><Link href="/termos-de-uso" className="hover:text-blue-600 dark:hover:text-blue-400">Termos de Uso</Link></div></footer>
      <BackToTop />
      <AdminNoticeModal />
    </AuthLayout>
  );
}
