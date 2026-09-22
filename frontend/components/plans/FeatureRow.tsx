import { Accent } from "@/types/plans";

const FEATURE_ACCENT: Record<Accent, { check: string; cross: string }> = {
  slate: { check: "text-emerald-300", cross: "text-white/35" },
  teal: { check: "text-emerald-200", cross: "text-white/35" },
  blue: { check: "text-emerald-200", cross: "text-white/35" },
};

type Props = {
  included: boolean;
  label: string;
  accent: Accent;
};

export default function FeatureRow({ included, label, accent }: Props) {
  const icon = included ? "✓" : "×";
  const iconCls = included
    ? FEATURE_ACCENT[accent].check
    : FEATURE_ACCENT[accent].cross;

  return (
    <li className="flex items-start gap-3 text-sm">
      <span
        className={[
          "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-sm font-bold",
          included ? "bg-white/10" : "bg-white/5",
          iconCls,
        ].join(" ")}
        aria-hidden="true"
      >
        {icon}
      </span>

      <span
        className={[
          "leading-5",
          included ? "text-white/90" : "text-white/35 line-through",
        ].join(" ")}
      >
        {label}
      </span>
    </li>
  );
}
