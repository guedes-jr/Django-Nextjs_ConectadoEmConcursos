"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Package,
  FileText,
  BarChart3,
  Database,
  LogOut,
  ExternalLink,
  Menu,
  Loader2,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { useMe } from "@/lib/useMe";
import { adminUrl } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const navGroups = [
  {
    label: "Visão geral",
    items: [
      { href: "/admin", label: "Início", icon: LayoutDashboard },
      { href: "/admin/usuarios", label: "Usuários", icon: Users },
      { href: "/admin/assinaturas", label: "Assinaturas", icon: CreditCard },
      { href: "/admin/planos", label: "Planos", icon: Package },
      { href: "/admin/staff", label: "Staff", icon: ShieldCheck },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/admin/conteudo", label: "Conteúdo", icon: FileText },
      { href: "/admin/relatorios", label: "Relatórios de estudo", icon: BarChart3 },
      { href: "/admin/backups", label: "Backups", icon: Database },
    ],
  },
];

const flatItems = navGroups.flatMap((g) => g.items);

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
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-500 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const currentLabel = flatItems.find((item) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href),
  )?.label;

  const nav = (
    <nav className="flex-1 space-y-5 px-3 py-4">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active =
                item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-indigo-600 text-white dark:bg-indigo-500/10 dark:text-indigo-300"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      <div className="space-y-1">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
        >
          <ExternalLink className="h-4 w-4" /> Ver o site
        </Link>
        <a
          href={adminUrl()}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
        >
          <ExternalLink className="h-4 w-4" /> Admin Django
        </a>
        <a
          href={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/accounts/logout/`}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4" /> Sair
        </a>
      </div>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-white">
        <GraduationCap className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">Conectado em Concursos</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Painel de gestão</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {brand}
        {nav}
        {footer}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{currentLabel ?? "Painel"}</p>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <p className="text-xs text-slate-500 dark:text-slate-300">
              {me.first_name || me.username}
              <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {me.is_staff ? "Staff" : "Aluno"}
              </span>
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}