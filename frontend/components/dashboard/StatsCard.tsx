type Props = {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  iconBg: string;
};

export function StatsCard({ title, value, subtitle, icon, iconBg }: Props) {
  return (
    <div className="dashboard-stat-card flex items-center justify-between rounded-2xl border p-5 shadow-sm">
      <div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {title}
        </div>
        <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
          {value}
        </div>
        <div className="mt-1 text-sm text-slate-400 dark:text-slate-400">
          {subtitle}
        </div>
      </div>

      <div
        className={`dashboard-stat-icon flex h-12 w-12 items-center justify-center rounded-xl text-white ${iconBg}`}
      >
        <span className="text-xl">{icon}</span>
      </div>
    </div>
  );
}
