import { Plan, BillingCycle, Accent } from "@/types/plans";
import { formatBRL } from "@/utils/format";
import FeatureRow from "@/components/plans/FeatureRow";

const ACCENT = {
  slate: {
    card: "bg-slate-800 text-white",
    header: "bg-slate-900/40",
    button:
      "bg-white/10 hover:bg-white/15 text-white border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed",
    shadow: "shadow-[0_20px_60px_-25px_rgba(15,23,42,0.65)]",
  },
  teal: {
    card: "bg-teal-700 text-white",
    header: "bg-teal-800/35",
    button:
      "bg-white hover:bg-white/95 text-teal-800 border border-white/30 disabled:opacity-60 disabled:cursor-not-allowed",
    shadow: "shadow-[0_20px_60px_-25px_rgba(13,148,136,0.65)]",
  },
  blue: {
    card: "bg-blue-700 text-white",
    header: "bg-blue-800/35",
    button:
      "bg-white hover:bg-white/95 text-blue-800 border border-white/30 disabled:opacity-60 disabled:cursor-not-allowed",
    shadow: "shadow-[0_20px_60px_-25px_rgba(29,78,216,0.65)]",
  },
} as const;

function Badge({ label, tone }: { label: string; tone: "orange" | "green" }) {
  const cls =
    tone === "orange"
      ? "bg-orange-500 text-white"
      : "bg-emerald-500 text-white";

  return (
    <span
      className={[
        "pointer-events-none absolute -top-3 right-4 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide shadow-sm",
        cls,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

type Props = {
  plan: Plan;
  cycle: BillingCycle;
  onSelect: () => void;
  selected?: boolean;
  loading?: boolean;
};

export default function PlanCard({ plan, cycle, onSelect, selected, loading }: Props) {
  const price = plan.price[cycle];
  const accent: Accent = plan.accent;

  return (
    <div
      className={[
        "relative w-full max-w-[340px] rounded-2xl p-6",
        ACCENT[accent].card,
        ACCENT[accent].shadow,
      ].join(" ")}
    >
      {plan.highlight ? (
        <Badge label={plan.highlight.label} tone={plan.highlight.tone} />
      ) : null}

      <div className={["rounded-xl px-4 py-3", ACCENT[accent].header].join(" ")}>
        <h3 className="text-center text-sm font-extrabold tracking-widest">
          {plan.title.toUpperCase()}
        </h3>
      </div>

      <div className="mt-6 text-center">
        <div className="flex items-end justify-center gap-2">
          <span className="text-4xl font-extrabold">
            {plan.key === "gratis" ? "R$0,00" : formatBRL(price)}
          </span>
          <span className="pb-1 text-xs text-white/70">
            {plan.periodLabel[cycle]}
          </span>
        </div>

        <div className="mt-2 text-xs text-white/60">
          {plan.key === "gratis"
            ? "Plano gratuito"
            : cycle === "mensal"
            ? "Cobrança mensal"
            : cycle === "semestral"
            ? "Cobrança semestral"
            : "Cobrança anual"}
        </div>
      </div>

      <div className="mt-6">
        <ul className="space-y-3">
          {plan.features.map((f) => (
            <FeatureRow
              key={f.label}
              included={f.included}
              label={f.label}
              accent={accent}
            />
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <button
          type="button"
          disabled={selected || loading}
          onClick={onSelect}
          className={[
            "w-full rounded-xl px-4 py-2.5 text-sm font-bold transition",
            ACCENT[accent].button,
          ].join(" ")}
        >
          {loading ? "Processando…" : selected ? "Plano atual" : plan.cta.label}
        </button>
      </div>
    </div>
  );
}
