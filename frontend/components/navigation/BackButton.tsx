import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type BackButtonProps = { href: string; label?: string; className?: string };

export function BackButton({ href, label = "Voltar", className = "" }: BackButtonProps) {
  return <Link href={href} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-200 dark:focus:ring-offset-slate-950 ${className}`}><ArrowLeft size={16} aria-hidden="true" />{label}</Link>;
}
