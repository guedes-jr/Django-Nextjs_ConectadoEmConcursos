"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Package,
  BarChart3,
  Database,
  LogOut,
  ExternalLink,
  Menu,
  Loader2,
  GraduationCap,
  ShieldCheck,
  ClipboardCheck,
  Search,
  Archive,
  Trophy,
  FilePlus2,
  Newspaper,
  Building2,
  HelpCircle,
  Bell,
  History,
  Activity,
  ChevronDown,
} from "lucide-react";
import { useMe } from "@/lib/useMe";
import { adminUrl } from "@/lib/admin";
import { cn } from "@/lib/utils";

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
    label: "Conteúdos",
    items: [
      { href: "/admin/conteudo", label: "Visão geral", icon: LayoutDashboard },
      { href: "/admin/bancas", label: "Bancas", icon: Building2 },
      { href: "/admin/concursos", label: "Concursos", icon: Trophy },
      { href: "/admin/provas", label: "Provas", icon: FilePlus2 },
      { href: "/admin/questoes", label: "Questões", icon: HelpCircle },
      { href: "/admin/artigos", label: "Artigos", icon: Newspaper },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/admin/fontes-questoes", label: "Fontes de questões", icon: Search },
      { href: "/admin/fila-questoes", label: "Fila de revisão", icon: ClipboardCheck },
      { href: "/admin/acervo-provas", label: "Acervo de provas", icon: Archive },
      { href: "/admin/backups", label: "Backups", icon: Database },
      { href: "/admin/notificacoes", label: "Notificações", icon: Bell },
      { href: "/admin/auditoria", label: "Auditoria", icon: History },
      { href: "/admin/diagnostico", label: "Diagnóstico", icon: Activity },
    ],
  },
  {
    label: "Relatórios",
    items: [
      { href: "/admin/relatorios", label: "Estudo e uso", icon: BarChart3 },
      { href: "/admin/relatorios/negocio", label: "Negócio e receita", icon: BarChart3 },
      { href: "/admin/operacao", label: "Painel editorial", icon: Activity },
    ],
  },
];

const flatItems = navGroups.flatMap((g) => g.items);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, isLoading } = useMe();
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState("Visão geral");

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

  const isActive = (href: string) => href === "/admin" ? pathname === "/admin" : pathname === href || (pathname.startsWith(`${href}/`) && !flatItems.some((item) => item.href !== href && item.href.startsWith(`${href}/`) && (pathname === item.href || pathname.startsWith(`${item.href}/`))));
  const currentLabel = flatItems.find((item) => isActive(item.href))?.label;

  const nav = (
    <nav className="admin-nav-scroll flex-1 space-y-3 overflow-y-auto px-3 py-5">
      {navGroups.map((group) => {
        const expanded = expandedGroup === group.label;
        return <div key={group.label}>
          <button type="button" onClick={() => setExpandedGroup(expanded ? "" : group.label)} className="flex w-full items-center justify-between px-3 pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-200/70 hover:text-white">
            {group.label}<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
          {expanded && <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-white/18 text-white shadow-sm ring-1 ring-white/15"
                        : "text-indigo-100/75 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>}
        </div>;
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-3">
      <div className="space-y-1">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-indigo-100/75 hover:bg-white/10 hover:text-white"
        >
          <ExternalLink className="h-4 w-4" /> Ver o site
        </Link>
        <a
          href={adminUrl()}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-indigo-100/75 hover:bg-white/10 hover:text-white"
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
    <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-indigo-400 text-slate-950 shadow-lg shadow-indigo-950/20">
        <GraduationCap className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">Conectado em Concursos</p>
        <p className="text-xs text-indigo-100/65">Painel de gestão</p>
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-indigo-950/20 bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-950 shadow-2xl shadow-indigo-950/20 transition-transform lg:translate-x-0",
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
          <p className="text-sm font-semibold text-slate-800 dark:text-white">{currentLabel ?? "Painel"}</p>
          <div className="ml-auto flex items-center gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-300">
              {me.first_name || me.username}
              <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {me.is_staff ? "Staff" : "Aluno"}
              </span>
            </p>
          </div>
        </header>

        <main
          className={cn(
            "mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8",
            (pathname.startsWith("/admin/questoes") || pathname.startsWith("/admin/fila-questoes") || pathname.startsWith("/admin/fontes-questoes")) && "max-w-none",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}