"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  Package,
  Users,
  FileText,
  Database,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Loader2,
} from "lucide-react";
import { useMe } from "@/lib/useMe";
import { adminUrl } from "@/lib/admin";

const navItems = [
  { href: "/admin", label: "Início", icon: LayoutDashboard },
  { href: "/admin/assinaturas", label: "Assinaturas", icon: CreditCard },
  { href: "/admin/planos", label: "Planos", icon: Package },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/conteudo", label: "Conteúdo", icon: FileText },
  { href: "/admin/backups", label: "Backups", icon: Database },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, isLoading } = useMe();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!me) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!me.is_staff) {
      router.replace("/dashboard");
    }
  }, [isLoading, me, router, pathname]);

  if (isLoading || !me || !me.is_staff) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-slate-200 transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div>
            <p className="text-sm font-bold text-white">Conectado em Concursos</p>
            <p className="text-xs text-slate-400">Painel de gestão</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-500 text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-3 py-4 space-y-1">
          <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
            <ExternalLink size={18} /> Ver o site
          </Link>
          <a
            href={adminUrl()}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={18} /> Admin Django
          </a>
          <a href={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/accounts/logout/`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
            <LogOut size={18} /> Sair
          </a>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {navItems.find((item) => item.href === pathname)?.label ?? "Painel"}
          </p>
          <p className="ml-auto text-xs text-slate-500 dark:text-slate-400">{me.username}</p>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}