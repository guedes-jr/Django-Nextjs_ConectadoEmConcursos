"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  FileQuestion,
  Headphones,
  Mail,
  MessageCircle,
  NotebookTabs,
  ScrollText,
  Sparkles,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const resources = [
  [
    FileQuestion,
    "Sistema de questões e gestão de tempo",
    "Resolva questões ou provas com tempo controlado. Treine no ritmo certo e acompanhe seu progresso.",
  ],
  [
    ScrollText,
    "Meu Edital",
    "Acesse provas já aplicadas em concursos de Sergipe. Estude com o que realmente cai.",
  ],
  [
    BarChart3,
    "Relatórios e estatísticas",
    "Acompanhe seu progresso, identifique áreas de melhoria e compare seu desempenho.",
  ],
  [
    Video,
    "Videoaulas, PDFs e simulados",
    "Área de estudos completa com materiais organizados por disciplina.",
  ],
  [
    NotebookTabs,
    "Planos e cronogramas",
    "Organize seus estudos de acordo com sua disponibilidade de tempo.",
  ],
  [
    CalendarDays,
    "Calendário de provas",
    "Gerencie concursos, datas de inscrição e provas em um só calendário.",
  ],
] as const;

const plans = [
  {
    name: "Gratuito",
    price: "R$0,00",
    suffix: "/mês",
    description: "Para conhecer a plataforma",
    featured: false,
    badge: "",
    features: [
      "20 questões por dia",
      "Estatísticas básicas",
      "Acesso ao Meu Painel",
    ],
    action: "Criar conta",
  },
  {
    name: "Padrão",
    price: "R$59,90",
    suffix: "/mês",
    description: "Ideal para quem está começando",
    featured: false,
    badge: "",
    features: [
      "Questões ilimitadas",
      "Provas anteriores",
      "Comentários da comunidade",
    ],
    action: "Ver plano",
  },
  {
    name: "Premium Anual",
    price: "12x R$139,90",
    suffix: "ou R$1.397,00 à vista",
    description: "Foco total na aprovação",
    featured: true,
    badge: "Melhor custo-benefício",
    features: [
      "Tudo ilimitado",
      "IA integrada",
      "Resumos completos",
      "Área de estudos exclusiva",
      "Estatísticas avançadas",
      "Simulado por edital",
      "Cronograma estratégico",
      "Fórum da comunidade",
    ],
    action: "Escolher Premium",
  },
  {
    name: "Avançado",
    price: "R$119,90",
    suffix: "/mês",
    description: "Para quem leva a preparação a sério",
    featured: false,
    badge: "Mais escolhido",
    features: [
      "Tudo do Padrão",
      "Estatísticas detalhadas",
      "Simulados personalizados",
      "Flashcards ilimitados",
      "Revisões espaçadas",
      "IA avançada",
    ],
    action: "Ver plano",
  },
  {
    name: "Avançado",
    price: "R$329,90",
    suffix: "/trimestre",
    description: "Para quem leva a preparação a sério",
    featured: false,
    badge: "🔥 Economize R$29,80",
    features: [
      "Tudo do Padrão",
      "Estatísticas detalhadas",
      "Questões em PDF",
      "Simulados personalizados",
      "Flashcards ilimitados",
      "Revisões espaçadas",
      "Resumos e PDFs",
      "Área de estudos personalizada",
      "IA avançada",
      "Edital verticalizado com IA",
    ],
    action: "Ver plano",
  },
] as const;

const community = [
  [
    Trophy,
    "Ranking de usuários",
    "Compare seu desempenho com outros concurseiros e encontre motivação extra para estudar.",
  ],
  [
    MessageCircle,
    "Fórum da comunidade",
    "Tire dúvidas, troque experiências e conecte-se com quem está na mesma jornada.",
  ],
  [
    Users,
    "Parceria de estudos",
    "Convide outros concurseiros para estudar juntos e manter a constância.",
  ],
  [
    Headphones,
    "Suporte ativo + updates",
    "Conte com suporte e uma plataforma que evolui continuamente.",
  ],
] as const;

const faqs = [
  [
    "Quais são as formas de pagamento?",
    "Você pode escolher o plano que melhor combina com seu momento e conferir as opções disponíveis na área de planos.",
  ],
  [
    "Apenas sergipanos podem usar a plataforma?",
    "Não. A plataforma é aberta para concurseiros de todo o Brasil, com um olhar especial para as oportunidades de Sergipe.",
  ],
  [
    "Qual é o diferencial do Conectado em Concursos?",
    "Reunimos questões, provas, estatísticas, materiais, IA e comunidade para você não precisar organizar sua preparação em vários lugares.",
  ],
] as const;

const studySteps = [
  [
    "1",
    "Crie sua conta",
    "Cadastre-se gratuitamente e tenha acesso imediato à plataforma de estudos.",
  ],
  [
    "2",
    "Resolva questões",
    "Treine com questões, provas anteriores e simulados para melhorar seu desempenho.",
  ],
  [
    "3",
    "Acompanhe sua evolução",
    "Use estatísticas, relatórios e inteligência artificial para evoluir continuamente.",
  ],
] as const;

const testimonials = [
  [
    "A plataforma me ajudou a organizar a preparação e entender onde precisava melhorar.",
    "Marina A.",
    "Concurseira",
  ],
  [
    "Hoje consigo estudar com foco, acompanhar meu desempenho e manter uma rotina consistente.",
    "Rafael S.",
    "Candidato a tribunais",
  ],
  [
    "Ter questões, provas e materiais no mesmo lugar mudou completamente meus estudos.",
    "Camila L.",
    "Concurseira",
  ],
] as const;

export default function LandingPage() {
  return (
    <main className="landing-page min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <a
        href="https://wa.me/5579996327084"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition hover:bg-green-600"
        aria-label="Fale conosco no WhatsApp"
        title="Fale conosco no WhatsApp"
      >
        <MessageCircle size={22} />
      </a>
      <header className="relative z-30 border-b border-white/10 bg-[#172b4d] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-6 px-5 py-3 lg:px-8">
          <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
            <a href="#recursos" className="transition hover:text-blue-200">
              Recursos
            </a>
            <a href="#planos" className="transition hover:text-blue-200">
              Planos
            </a>
            <a href="#comunidade" className="transition hover:text-blue-200">
              Comunidade
            </a>
            <a href="#faq" className="transition hover:text-blue-200">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-blue-900 shadow-sm transition hover:bg-amber-300"
            >
              Entrar <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <section className="hero-reference relative isolate min-h-[780px] overflow-hidden px-5 pb-10 pt-16 text-white lg:px-8 lg:pb-0 lg:pt-20">
        <div className="landing-hero-reference-overlay absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_.82fr]">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-3">
              <Image
                src="/landing/logo.png"
                alt="Conectado em Concursos"
                width={58}
                height={58}
                className="rounded-xl"
              />
              <div>
                <p className="text-xl font-extrabold leading-tight">
                  Conectado em Concursos
                </p>
                <p className="text-sm text-white/75">
                  Plataforma #1 para concursos em Sergipe
                </p>
              </div>
            </div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#152342] px-3 py-1.5 text-xs font-bold text-white">
              <Sparkles size={14} className="text-amber-400" /> Seja o
              concurseiro Nº1 dos Concursos
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Sua aprovação em{" "}
              <span className="text-amber-400">concursos públicos</span> começa
              aqui.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-blue-100">
              A plataforma mais completa e fácil de usar para quem estuda para
              concursos públicos em Sergipe. Questões, provas, resumos, PDFs,
              videoaulas, comunidade e IA em um só lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#planos"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-6 py-3.5 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300"
              >
                Ver planos <ArrowRight size={17} />
              </a>
              <a
                href="#recursos"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/40 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Recursos
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-blue-100">
              <span className="flex items-center gap-1.5">
                <Check size={15} /> Estratégico para estudar
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={15} /> Suporte ativo
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={15} /> Updates constantes
              </span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md self-end">
            <Image
              src="/landing/modelo.png"
              alt="Estudante aprovada usando Conectado em Concursos"
              width={832}
              height={1250}
              priority
              className="relative mx-auto max-h-[620px] w-auto object-contain object-bottom drop-shadow-2xl"
            />
          </div>
        </div>
      </section>

      <section
        id="como-funciona"
        className="how-section px-5 py-20 lg:px-8 lg:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <div className="section-intro mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Como funciona
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Seu estudo mais <span>estratégico</span>
            </h2>
            <p className="mt-4 leading-7 text-white/65">
              A plataforma foi criada para ajudar você a estudar de forma
              inteligente e focada na aprovação.
            </p>
          </div>
          <div className="steps-grid mt-12 grid gap-5 md:grid-cols-3">
            {studySteps.map(([number, title, text]) => (
              <article key={number} className="step-card">
                <span className="step-number">{number}</span>
                <div className="step-icon">
                  <BarChart3 size={22} />
                </div>
                <h3 className="mt-5 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="recursos" className="px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
              Recursos
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Tudo que você precisa para ser aprovado
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Ferramentas indispensáveis reunidas na plataforma mais completa
              para concursos em Sergipe.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map(([Icon, title, text]) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon size={22} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="estatisticas"
        className="stats-section px-5 py-20 lg:px-8 lg:py-28"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Seu desempenho
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Estude, acompanhe e evolua
            </h2>
            <p className="mt-5 leading-7 text-white/65">
              Transforme cada tentativa em informação para tomar decisões
              melhores sobre sua preparação.
            </p>
          </div>
          <div className="stats-preview grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-white/60">Questões resolvidas</p>
              <strong>1.240</strong>
              <span>+24% este mês</span>
            </div>
            <div>
              <p className="text-sm text-white/60">Taxa de acerto</p>
              <strong>78%</strong>
              <span>Seu melhor ritmo</span>
            </div>
            <div>
              <p className="text-sm text-white/60">Dias de estudo</p>
              <strong>32</strong>
              <span>Constância ativa</span>
            </div>
          </div>
        </div>
      </section>

      <section id="planos" className="bg-slate-100 px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
              Planos
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Invista na sua aprovação
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Escolha o plano ideal para o seu momento de preparação.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {plans.map((plan) => (
              <article
                key={`${plan.name}-${plan.price}`}
                className={`relative flex flex-col rounded-2xl border p-6 ${plan.featured ? "border-blue-600 bg-white text-slate-900 shadow-xl lg:-translate-y-3" : "border-slate-200 bg-white text-slate-900 shadow-sm"}`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-900">
                    {plan.badge || "Mais escolhido"}
                  </span>
                )}
                {plan.badge && !plan.featured && (
                  <span className="mb-4 inline-flex w-fit rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-300">
                    {plan.badge}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-lg bg-blue-50 p-2 text-blue-600"
                  >
                    <Trophy size={18} />
                  </div>
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                </div>
                <p
                  className="mt-6 text-3xl font-extrabold text-slate-900"
                >
                  {plan.price}
                </p>
                <p
                  className="mt-1 text-xs text-slate-500"
                >
                  {plan.suffix}
                </p>
                <p
                  className="mt-4 min-h-10 text-sm text-slate-600"
                >
                  {plan.description}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-blue-600"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`mt-7 inline-flex items-center justify-center rounded-lg px-4 py-3 text-sm font-bold ${plan.featured ? "bg-amber-400 text-slate-900 hover:bg-amber-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                >
                  {plan.action} <ArrowRight size={15} className="ml-2" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ia-feature px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
              Inteligência artificial
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Edital resumido por IA em segundos
            </h2>
            <p className="mt-5 leading-7 text-slate-600">
              Não perca horas analisando editais. Em segundos, nossa tecnologia
              entrega um resumo completo com datas, disciplinas, assuntos
              cobrados e pontuação estratégica.
            </p>
            <ul className="mt-7 space-y-4 text-sm font-semibold text-slate-700">
              <li className="flex gap-3">
                <Check className="text-green-600" size={18} /> Economize horas
                de leitura de edital
              </li>
              <li className="flex gap-3">
                <Check className="text-green-600" size={18} /> Resumo
                inteligente com os pontos mais importantes
              </li>
              <li className="flex gap-3">
                <Check className="text-green-600" size={18} /> Foque no que dá
                mais pontos
              </li>
            </ul>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
            >
              Experimentar a plataforma <ArrowRight size={16} />
            </Link>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-lg">
            <Image
              src="/landing/simulado-edital.png"
              alt="Simulado baseado no edital com análise automática por IA"
              width={1901}
              height={944}
              className="rounded-xl"
            />
          </div>
        </div>
      </section>

      <section
        id="depoimentos"
        className="testimonials-section px-5 py-20 lg:px-8 lg:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <div className="section-intro mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Depoimentos
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Quem estuda com intenção sente a diferença
            </h2>
            <p className="mt-4 text-white/65">
              Histórias de quem está construindo uma aprovação, um dia de cada
              vez.
            </p>
          </div>
          <div className="testimonials-grid mt-12 grid gap-5 md:grid-cols-3">
            {testimonials.map(([quote, name, role]) => (
              <figure key={name}>
                <div className="text-amber-400">★★★★★</div>
                <blockquote className="mt-5 text-lg font-semibold leading-8">
                  “{quote}”
                </blockquote>
                <figcaption className="mt-6">
                  <strong>{name}</strong>
                  <span>{role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section
        id="comunidade"
        className="bg-blue-50 px-5 py-20 lg:px-8 lg:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
              Comunidade
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Você não estuda sozinho
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Ranking, fórum, cronogramas e suporte para você se manter motivado
              e focado na aprovação.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {community.map(([Icon, title, text]) => (
              <article
                key={title}
                className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm"
              >
                <Icon className="text-blue-600" size={25} />
                <h3 className="mt-6 text-lg font-bold text-slate-900">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-premium-section px-5 py-20 lg:px-8 lg:py-28">
        <div className="cta-premium-glow" />
        <div className="cta-premium-content">
          <h2 className="cta-premium-title text-3xl font-extrabold sm:text-5xl">
            Pronto para começar sua jornada de aprovação?
          </h2>
          <p className="cta-premium-description mx-auto mt-4 max-w-2xl text-blue-100">
            Junte-se a concurseiros em Sergipe que já estão usando uma
            plataforma completa para estudar melhor.
          </p>
          <div className="cta-premium-actions">
            <Link href="/register" className="cta-premium-btn primary">
              Acessar a plataforma <ArrowRight size={17} />
            </Link>
            <a href="#planos" className="cta-premium-btn secondary">
              Ver planos
            </a>
          </div>
        </div>
      </section>

      <section className="team-section px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
              Sobre o projeto
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Os nomes por trás do projeto
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Mais organização. Mais foco. Mais resultados.
            </p>
          </div>
          <div className="team-grid mx-auto mt-12">
            <div className="team-card">
              <div className="team-avatar-wrap">
                <div className="team-avatar-ring">
                  <Image
                    src="/landing/jairo.png"
                    alt="Jairo Dos Santos"
                    width={640}
                    height={640}
                    className="team-avatar"
                  />
                </div>
              </div>
              <h3 className="team-name">Jairo Dos Santos</h3>
              <p className="team-role">CEO & Desenvolvedor</p>
            </div>
            <div className="team-card">
              <div className="team-avatar-wrap">
                <div className="team-avatar-ring">
                  <Image
                    src="/landing/joao.png"
                    alt="João Guedes"
                    width={717}
                    height={980}
                    className="team-avatar"
                  />
                </div>
              </div>
              <h3 className="team-name">João Guedes</h3>
              <p className="team-role">Co-fundador & Programador Front End</p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="faq-section bg-slate-100 px-5 py-20 lg:px-8 lg:py-28"
      >
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.75fr_1.25fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Perguntas frequentes
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Aqui estão algumas das dúvidas mais comuns.
            </p>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question} className="faq-item group">
                <summary className="faq-question flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-bold text-slate-900">
                  <span>{question}</span>
                  <ChevronDown
                    size={20}
                    className="shrink-0 text-blue-600 transition group-open:rotate-180"
                  />
                </summary>
                <p className="faq-answer pt-3 text-sm leading-7 text-slate-600">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-5 py-12 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/landing/logo.png"
                alt="Conectado em Concursos"
                width={42}
                height={42}
                className="rounded-full"
              />
              <div>
                <p className="font-bold text-slate-900">
                  Conectado em Concursos
                </p>
                <p className="text-xs text-slate-500">
                  Plataforma para concursos em Sergipe
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-xs text-sm leading-6 text-slate-600">
              Questões, provas, IA e muito mais para sua aprovação em um só
              lugar.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Navegação</h3>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <a href="#recursos" className="hover:text-blue-600">
                Recursos
              </a>
              <a href="#planos" className="hover:text-blue-600">
                Planos
              </a>
              <a href="#comunidade" className="hover:text-blue-600">
                Comunidade
              </a>
              <a href="#faq" className="hover:text-blue-600">
                FAQ
              </a>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Acesso</h3>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <Link href="/login" className="hover:text-blue-600">
                Entrar
              </Link>
              <Link href="/register" className="hover:text-blue-600">
                Criar conta
              </Link>
              <Link href="/plans" className="hover:text-blue-600">
                Planos no sistema
              </Link>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Contato</h3>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <a href="tel:+5579996327084" className="hover:text-blue-600">
                (79) 9 9632-7084
              </a>
              <a
                href="mailto:conectadoemconcursos@gmail.com"
                className="inline-flex items-center gap-2 hover:text-blue-600"
              >
                <Mail size={15} /> conectadoemconcursos@gmail.com
              </a>
              <span>Aracaju, Sergipe - Brasil</span>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col justify-between gap-3 border-t border-slate-100 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>© 2026 Conectado em Concursos. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <a href="#faq" className="hover:text-blue-600">
              Privacidade
            </a>
            <a href="#faq" className="hover:text-blue-600">
              Termos de uso
            </a>
          </div>
        </div>
      </footer>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
        aria-label="Voltar ao topo"
        title="Voltar ao topo"
      >
        <ArrowUp size={18} />
      </button>
    </main>
  );
}
