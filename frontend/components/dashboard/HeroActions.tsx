import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";

type Props = { name: string; todayTotal: number; streak: number };

export function HeroActions({ name, todayTotal, streak }: Props) {
  return (
    <section className="dashboard-hero relative overflow-hidden rounded-[28px] p-7 text-white shadow-xl sm:p-10">
      <div className="dashboard-hero-glow" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_260px] lg:items-end">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50">
            <Sparkles size={14} /> Seu espaço de preparação
          </span>
          <h1 className="mt-5 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            Olá, {name}. <span className="text-amber-300">Vamos avançar hoje?</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-blue-100 sm:text-base">
            Cada questão é uma oportunidade de aprender. Continue de onde parou e acompanhe sua evolução aqui.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/questions" className="dashboard-primary-action inline-flex min-h-12 items-center gap-2 rounded-xl px-5 font-bold">
              Resolver questões <ArrowRight size={18} />
            </Link>
            <Link href="/exams" className="dashboard-secondary-action inline-flex min-h-12 items-center gap-2 rounded-xl px-5 font-semibold">
              <BookOpen size={18} /> Explorar provas
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <p className="text-xs font-medium text-blue-100">Questões hoje</p>
            <p className="mt-1 text-3xl font-extrabold">{todayTotal}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <p className="text-xs font-medium text-blue-100">Sequência de estudos</p>
            <p className="mt-1 text-3xl font-extrabold">{streak} <span className="text-sm font-medium">dias</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
