"use client";

import Link from "next/link";
import {
  BookOpen,
  Briefcase,
  GraduationCap,
  Shield,
  Stethoscope,
  Cpu,
  Calculator,
  Landmark,
  ClipboardList,
} from "lucide-react";

// The exact sequence of icons from the mockup
const ICONS = [
  Briefcase,
  GraduationCap,
  Shield,
  Stethoscope,
  Cpu,
  Calculator,
  Landmark,
  ClipboardList
];

const CAREERS = [
  "Técnico Judiciário",
  "Analista Judiciário",
  "Agente Penitenciário",
  "Policial Civil",
  "Policial Federal",
  "Auditor Fiscal",
  "Técnico da Receita Federal",
  "Analista da Receita Federal",
  "Professor (Educação Básica)",
  "Professor (Português)",
  "Professor (Matemática)",
  "Enfermeiro",
  "Médico",
  "Contador",
  "Advogado",
  "Engenheiro",
  "Analista de Sistemas",
  "Técnico em Informática",
  "Assistente Administrativo",
  "Escriturário",
  "Técnico Bancário",
  "Analista Bancário"
];

export default function AreaEstudosPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 p-6 lg:p-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-10">
        
        {/* Header Title */}
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Área de Estudos
          </h1>
        </header>

        {/* Introduction Section */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Áreas de Estudo</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Escolha uma carreira para acessar os materiais e conteúdos do curso.
          </p>
        </section>

        {/* Custom Folders Section */}
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Pastas de Materiais Personalizadas</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Organize seus próprios materiais por pasta. Em breve você poderá criar e gerenciar essas pastas aqui.
            </p>
          </div>
          
          <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:bg-slate-900">
            <div className="mb-3 rounded-lg bg-slate-100 p-3 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <BookOpen className="h-6 w-6" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Você ainda não criou nenhuma pasta.<br/>
              Crie uma pasta para organizar seus próprios materiais.
            </p>
          </div>
        </section>

        {/* Careers Grid Section */}
        <section className="space-y-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Áreas de Estudo</h3>
          
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {CAREERS.map((career, i) => {
              const Icon = ICONS[i % ICONS.length];
              return (
                <Link
                  key={i}
                  href="#"
                  className="group flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                >
                  <div className="rounded-xl bg-slate-100 p-3 text-slate-500 transition-colors group-hover:bg-slate-200 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-700 dark:group-hover:text-slate-300">
                    <Icon className="h-6 w-6 stroke-[1.5]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{career}</h4>
                    <p className="mt-1 text-[11px] text-slate-500 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-400">
                      Acessar conteúdo do curso
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

      </div>
    </main>
  );
}
