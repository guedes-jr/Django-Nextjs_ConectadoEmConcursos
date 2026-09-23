"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Brain, CalendarDays, ChartColumn, ChevronDown, ClipboardList, CreditCard, FileText, GraduationCap, HelpCircle, History, ListChecks, Menu, MessageSquare, NotebookPen, Send, Shield, Trophy, User, Users, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useMe } from "@/lib/useMe";
import { adminUrl, backendUrl } from "@/lib/admin";

const primary = [
  { label: "Painel", href: "/dashboard" }, { label: "Questões", href: "/questions" },
  { label: "Provas", href: "/exams" }, { label: "Concursos", href: "/concursos" },
  { label: "Notícias", href: "/noticias" }, { label: "Simulados", href: "/simulations" },
  { label: "Área de Estudos", href: "/study" },
];
const groups = [
  { title: "Estudos & planejamento", items: [
    { label: "Cadernos de Questões", href: "/notebooks", icon: ClipboardList },
    { label: "Meus Flashcards", href: "/flashcards", icon: Brain },
    { label: "Minhas Anotações", href: "/notes", icon: NotebookPen },
    { label: "Resumos", href: "/summaries", icon: FileText },
    { label: "ChatIA", href: "/chatIA", icon: MessageSquare },
    { label: "Criar Planejamento de Estudos", href: "/study", icon: CalendarDays },
    { label: "Minhas Dúvidas", href: "/chatIA", icon: HelpCircle },
  ] },
  { title: "Desempenho & estatísticas", items: [
    { label: "Relatórios", href: "/reports", icon: ChartColumn },
    { label: "Minhas Estatísticas", href: "/statistics", icon: ChartColumn },
    { label: "Ranking de Usuários", href: "/ranking", icon: Trophy },
  ] },
  { title: "Comunidade", items: [
    { label: "Pessoas", href: "/people", icon: Users },
    { label: "Fórum", href: "/forum", icon: MessageSquare },
    { label: "Feed de Atividades", href: "/feed", icon: ListChecks },
  ] },
  { title: "Quizzes", items: [
    { label: "Quiz de Inglês", href: "/quizzes/english", icon: BookOpen },
    { label: "Quiz de Matemática", href: "/quizzes/math", icon: BookOpen },
    { label: "Quiz de Raciocínio Lógico", href: "/quizzes/logic", icon: BookOpen },
  ] },
  { title: "Simulados extras", items: [
    { label: "Simulados Digital", href: "/simulations", icon: ClipboardList },
    { label: "Histórico de Simulações", href: "/simulations/history", icon: History },
    { label: "Revisão de Simulados", href: "/simulations/review", icon: ListChecks },
  ] },
  { title: "Conta", items: [
    { label: "Meu Perfil", href: "/profile", icon: User },
    { label: "Painel de Assinaturas", href: "/plans", icon: CreditCard },
  ] },
];

export function AppHeader() {
  const pathname = usePathname();
  const { me } = useMe();
  const [openMore, setOpenMore] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);
  useEffect(() => { setOpenMore(false); setOpenUser(false); setOpenMobile(false); }, [pathname]);
  const name = [me?.first_name, me?.last_name].filter(Boolean).join(" ") || me?.username || "Minha conta";
  const avatar = me?.avatar || me?.social_avatar;
  return <header className="relative z-[100] bg-blue-600 text-white shadow-sm">
    <div className="mx-auto flex min-h-16 max-w-[1500px] items-center gap-3 px-4 lg:px-6">
      <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5" aria-label="Ir ao painel"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><GraduationCap size={21} /></span><span className="hidden text-sm font-bold leading-tight 2xl:block">Conectado em<br />Concursos Públicos</span></Link>
      <nav className="ml-auto hidden items-center gap-1 xl:flex" aria-label="Navegação principal">{primary.map((item) => <Link key={item.href} href={item.href} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${pathname === item.href ? "bg-blue-800 text-white" : "text-blue-50 hover:bg-white/15"}`}>{item.label}</Link>)}<button type="button" aria-expanded={openMore} onClick={() => setOpenMore(!openMore)} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold ${openMore ? "bg-blue-800" : "hover:bg-white/15"}`}>Mais <ChevronDown size={16} /></button></nav>
      <div className="ml-auto flex items-center gap-2 xl:ml-2"><Link href="/submit-exam" className="hidden items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-sm font-semibold hover:bg-blue-800 2xl:flex"><Send size={16} /> Enviar Prova</Link><ThemeToggle /><div className="relative"><button type="button" aria-label="Abrir opções da conta" aria-expanded={openUser} onClick={() => setOpenUser(!openUser)} className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-blue-800 ring-2 ring-white/30">{avatar ? <Image src={avatar} alt="Foto de perfil" width={36} height={36} className="h-9 w-9 object-cover" unoptimized /> : <User size={18} />}</button>{openUser && <div className="absolute right-0 top-full z-[120] mt-3 w-52 rounded-xl border border-blue-400 bg-blue-700 p-2 shadow-2xl"><p className="truncate px-3 py-2 text-xs text-blue-100">{name}</p><Link className="block rounded-lg px-3 py-2 text-sm hover:bg-white/15" href="/profile">Meu perfil</Link><Link className="block rounded-lg px-3 py-2 text-sm hover:bg-white/15" href="/plans">Planos</Link>{me?.is_staff && <Link className="block rounded-lg px-3 py-2 text-sm hover:bg-white/15" href="/admin">Painel de Gestão</Link>}{me?.is_staff && <a className="block rounded-lg px-3 py-2 text-sm hover:bg-white/15" href={adminUrl()}>Admin Django</a>}<a className="block rounded-lg px-3 py-2 text-sm hover:bg-white/15" href={backendUrl("accounts/logout/")}>Sair</a></div>}</div><button type="button" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/15 xl:hidden" aria-label={openMobile ? "Fechar menu" : "Abrir menu"} aria-expanded={openMobile} onClick={() => setOpenMobile(!openMobile)}>{openMobile ? <X size={22} /> : <Menu size={22} />}</button></div>
    </div>
    {openMore && <div className="absolute right-4 top-full z-[110] hidden w-[min(920px,calc(100vw-2rem))] rounded-b-2xl border border-blue-400 bg-blue-600 p-5 shadow-2xl xl:block"><div className="grid grid-cols-3 gap-x-8 gap-y-7">{groups.map((group) => <section key={group.title}><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-100">{group.title}</h2><div className="space-y-1">{group.items.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition hover:bg-white/15"><Icon size={16} className="shrink-0" />{label}</Link>)}</div></section>)}</div>{me?.is_staff && <div className="mt-5 flex gap-4 border-t border-white/20 pt-4 text-sm"><Link href="/admin" className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/15"><Shield size={16} /> Painel de Gestão</Link><a href={adminUrl()} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/15"><Shield size={16} /> Admin Geral</a><a href={adminUrl("simulationrun/")} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/15"><Shield size={16} /> Admin Simulados Digital</a></div>}</div>}
    {openMobile && <nav aria-label="Menu móvel" className="absolute left-0 right-0 top-full z-[110] max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-blue-400 bg-blue-600 p-4 shadow-2xl xl:hidden"><div className="grid gap-1 sm:grid-cols-2">{primary.map((item) => <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/15">{item.label}</Link>)}</div><div className="mt-4 grid gap-5 border-t border-white/20 pt-4 sm:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <section key={group.title}><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-100">{group.title}</h2>{group.items.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-white/15"><Icon size={16} />{label}</Link>)}</section>)}</div><Link href="/submit-exam" className="mt-4 flex items-center gap-2 border-t border-white/20 px-2 py-3 text-sm font-semibold"><FileText size={16} /> Enviar Prova</Link>{me?.is_staff && <a href={adminUrl()} className="flex items-center gap-2 px-2 py-3 text-sm"><Shield size={16} /> Admin Geral</a>}</nav>}
  </header>;
}
