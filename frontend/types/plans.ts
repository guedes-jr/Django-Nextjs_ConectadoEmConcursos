export type BillingCycle = "mensal" | "semestral" | "anual";

export type PlanKey = "gratis" | "padrao" | "avancado";

export type Accent = "slate" | "teal" | "blue";

export type PlanFeature = {
  label: string;
  included: boolean;
};

export type PlanHighlight = {
  label: string;
  tone: "orange" | "green";
};

export type PlanCTA = {
  label: string;
  disabled?: boolean;
};

export type Plan = {
  key: PlanKey;
  title: string;
  accent: Accent;
  price: Record<BillingCycle, number>;
  periodLabel: Record<BillingCycle, string>;
  highlight?: PlanHighlight;
  cta: PlanCTA;
  features: PlanFeature[];
};

export type FAQ = {
  question: string;
  answer: string;
};
