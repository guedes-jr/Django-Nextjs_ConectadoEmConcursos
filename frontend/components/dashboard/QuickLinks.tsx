import Link from "next/link";
import { ArrowUpRight, BookOpen, CalendarDays, MessageCircle, NotebookPen } from "lucide-react";

const links = [
  { href: "/exams", label: "Explorar provas", description: "Encontre uma prova para praticar", icon: BookOpen },
  { href: "/study", label: "Meu plano de estudos", description: "Veja o que estudar hoje", icon: CalendarDays },
  { href: "/lousa", label: "Lousa de estudos", description: "Registre ideias e revisões", icon: NotebookPen },
  { href: "/chatIA", label: "Assistente de estudos", description: "Tire dúvidas durante a jornada", icon: MessageCircle },
];

export function QuickLinks() {
  return (
    <section className="dashboard-panel rounded-2xl border p-6 shadow-sm">
      <div className="mb-5">
        <p className="dashboard-eyebrow">Acesso rápido</p>
        <h2 className="mt-1 text-lg font-bold">O que você quer fazer?</h2>
      </div>
      <div className="grid gap-2">
        {links.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="dashboard-quick-link group flex items-center gap-3 rounded-xl border p-3">
            <span className="dashboard-quick-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Icon size={19} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="dashboard-muted block text-xs">{description}</span></span>
            <ArrowUpRight size={17} className="dashboard-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}
