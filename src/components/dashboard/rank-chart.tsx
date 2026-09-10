"use client";

import Link from "next/link";
import type { DashboardRankRow } from "@/lib/dashboard-types";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

function barColor(index: number, mode: "purchases" | "probability") {
  if (mode === "probability") {
    return ["#059669", "#0d9488", "#2563eb", "#7c3aed", "#d97706", "#e11d48"][index] ?? "#64748b";
  }

  return ["#1877f2", "#2563eb", "#4f46e5", "#0ea5e9", "#0284c7", "#0369a1"][index] ?? "#64748b";
}

export function RankChart({
  title,
  hint,
  href,
  rows,
  mode = "purchases",
  empty,
}: {
  title: string;
  hint: string;
  href: string;
  rows: DashboardRankRow[];
  mode?: "purchases" | "probability";
  empty: string;
}) {
  const max = Math.max(
    ...rows.map((row) => (mode === "purchases" ? row.purchases : row.sellProbability ?? 0)),
    1,
  );

  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{hint}</p>
        </div>
        <Link
          href={href}
          className="shrink-0 text-sm font-medium text-accent hover:text-accent-strong"
        >
          Tümü
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const value = mode === "purchases" ? row.purchases : row.sellProbability ?? 0;
            return (
              <Link key={row.id} href={row.href} className="block group">
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-800 group-hover:text-accent">
                    {index + 1}. {row.name}
                  </span>
                  <span className="shrink-0 font-semibold text-slate-700">
                    {mode === "purchases"
                      ? `${formatNumber(value)} satış`
                      : formatPercent(value)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(value / max) * 100}%`,
                      background: barColor(index, mode),
                    }}
                  />
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {row.subtitle}
                  {row.spend > 0
                    ? ` · ${formatMoney(row.spend, row.currency)}`
                    : ""}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}
