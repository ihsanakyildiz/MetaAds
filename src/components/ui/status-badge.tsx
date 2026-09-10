import type { ReactNode } from "react";

type StatusBadgeProps = {
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  children: ReactNode;
};

const tones = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  accent: "bg-blue-50 text-blue-700",
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
