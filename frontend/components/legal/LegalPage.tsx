import Link from "next/link";

import { PublicFooter, PublicNav } from "@/components/layout/PublicNav";

type Section = { title: string; content: React.ReactNode };
type LegalPageProps = { title: string; updatedAt: string; intro: string; sections: Section[] };

export function LegalPage({ title, updatedAt, intro, sections }: LegalPageProps) {
  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <PublicNav />
    <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
      <Link href="/" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">← Voltar para a página inicial</Link>
      <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Informações legais</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Última atualização: {updatedAt}</p>
        <p className="mt-8 leading-7 text-slate-600 dark:text-slate-300">{intro}</p>
        <div className="mt-10 space-y-8">{sections.map((section) => <section key={section.title}><h2 className="text-xl font-bold">{section.title}</h2><div className="mt-3 space-y-3 leading-7 text-slate-600 dark:text-slate-300">{section.content}</div></section>)}</div>
      </article>
    </main>
    <PublicFooter />
  </div>;
}
