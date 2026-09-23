"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme/ThemeToggle";


const links = [
  { label: "Início", href: "/" },
  { label: "Concursos", href: "/concursos" },
  { label: "Notícias", href: "/noticias" },
];

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/landing/logo.png"
            alt="Conectado em Concursos"
            width={34}
            height={34}
            className="rounded-lg"
          />
          <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Conectado em Concursos
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition hover:text-blue-600 dark:hover:text-blue-400 ${
                pathname === link.href ? "text-blue-600 dark:text-blue-400" : ""
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Entrar <ArrowRight size={15} />
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Criar conta
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Abrir menu"
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-slate-100 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
          <div className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Entrar</Link>
            <Link href="/register" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Criar conta</Link>
          </div>
        </nav>
      )}
    </header>
  );
}


export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-5 py-10 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400 sm:flex-row">
        <p>© 2026 Conectado em Concursos. Todos os direitos reservados.</p>
        <nav className="flex flex-wrap items-center gap-5">
          <Link href="/" className="transition hover:text-blue-600 dark:hover:text-blue-400">Início</Link>
          <Link href="/concursos" className="transition hover:text-blue-600 dark:hover:text-blue-400">Concursos abertos</Link>
          <Link href="/noticias" className="transition hover:text-blue-600 dark:hover:text-blue-400">Notícias</Link>
          <Link href="/register" className="transition hover:text-blue-600 dark:hover:text-blue-400">Criar conta</Link>
        </nav>
      </div>
    </footer>
  );
}