import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "accent";
};

const tones = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-success",
  warning: "bg-amber-50 text-warning",
  accent: "bg-blue-50 text-accent",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="mt-2 text-xs text-slate-400">{hint}</p> : null}
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
