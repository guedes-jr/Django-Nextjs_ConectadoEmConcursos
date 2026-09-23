import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const colorByVariant: Record<string, string> = {
  success: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  danger: "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  info: "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  violet: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
} as const;

const variantByStatus: Record<string, keyof typeof colorByVariant> = {
  active: "success",
  reviewed: "info",
  open: "success",
  resolved: "info",
  verified: "success",
  pending_payment: "warning",
  pending: "warning",
  expected: "warning",
  canceled: "danger",
  closed: "info",
  rejected: "danger",
  failed: "danger",
  blocked: "danger",
  inactive: "info",
};

export const statusLabels: Record<string, string> = {
  active: "Ativo",
  pending_payment: "Pagamento pendente",
  pending: "Pendente",
  reviewed: "Revisada",
  canceled: "Cancelada",
  open: "Aberta",
  closed: "Encerrado",
  expected: "Previsto",
  resolved: "Resolvido",
  rejected: "Rejeitado",
  failed: "Falhou",
  blocked: "Bloqueado",
  inactive: "Inativo",
  mensal: "Mensal",
  semestral: "Semestral",
  anual: "Anual",
  forum: "Fórum",
  feed: "Feed",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = variantByStatus[status];
  return (
    <Badge
      variant={variant ? "secondary" : undefined}
      className={cn(variant && colorByVariant[variant])}
    >
      {statusLabels[status] ?? status}
    </Badge>
  );
}

export function BadgeViolet({ children }: { children: React.ReactNode }) {
  return <Badge variant="secondary" className={colorByVariant.violet}>{children}</Badge>;
}