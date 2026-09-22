type Props = {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  iconBg: string;
};

export function StatsCard({ title, value, subtitle, icon, iconBg }: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex items-center justify-between">
      <div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
        <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
          {value}
        </div>
        <div className="mt-1 text-sm text-slate-400 dark:text-slate-400">
          {subtitle}
        </div>
      </div>

      <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-white ${iconBg}`}>
        <span className="text-xl">{icon}</span>
      </div>
    </div>
  );
}

