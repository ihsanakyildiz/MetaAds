"use client";

import type { SalesSlice } from "@/lib/sales-types";

const COLORS = [
  "#1877F2",
  "#0f9f6e",
  "#d97706",
  "#7c3aed",
  "#e11d48",
  "#0891b2",
  "#db2777",
  "#64748b",
];

type SalesPieChartProps = {
  slices: SalesSlice[];
  title: string;
};

function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function donutPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
) {
  const large = end - start > Math.PI ? 1 : 0;
  const startOuter = polar(cx, cy, outer, start);
  const endOuter = polar(cx, cy, outer, end);
  const startInner = polar(cx, cy, inner, end);
  const endInner = polar(cx, cy, inner, start);

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

export function SalesPieChart({ slices, title }: SalesPieChartProps) {
  const ranked = [...slices].sort((left, right) => right.purchases - left.purchases);
  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5);
  const otherPurchases = rest.reduce((sum, slice) => sum + slice.purchases, 0);
  const visible =
    otherPurchases > 0
      ? [...top, { key: "other", label: "Diğer", purchases: otherPurchases, purchaseValue: 0, spend: 0 }]
      : top;
  const total = visible.reduce((sum, slice) => sum + slice.purchases, 0);

  if (total === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <p className="mt-3 text-xs text-slate-400">Ülke kırılımı yok.</p>
      </div>
    );
  }

  const cx = 56;
  const cy = 56;
  const holes = 34;
  let angle = -Math.PI / 2;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 112 112" className="h-28 w-28 shrink-0">
          {visible.length === 1 ? (
            <g>
              <circle cx={cx} cy={cy} r="52" fill={COLORS[0]} />
              <circle cx={cx} cy={cy} r={holes} fill="#ffffff" />
            </g>
          ) : (
            visible.map((slice, index) => {
              const sweep = (slice.purchases / total) * Math.PI * 2;
              const start = angle;
              const end = angle + Math.max(sweep, 0.02);
              angle = end;

              return (
                <path
                  key={slice.key}
                  d={donutPath(cx, cy, holes, 52, start, end)}
                  fill={COLORS[index % COLORS.length]}
                />
              );
            })
          )}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            className="fill-slate-900"
            fontSize="13"
            fontWeight="700"
          >
            {total}
          </text>
          <text
            x={cx}
            y={cy + 13}
            textAnchor="middle"
            className="fill-slate-400"
            fontSize="8"
          >
            adet
          </text>
        </svg>
        <ul className="min-w-0 space-y-1.5">
          {visible.map((slice, index) => (
            <li key={slice.key} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[index % COLORS.length] }}
              />
              <span className="min-w-0 truncate text-slate-600">{slice.label}</span>
              <span className="ml-auto font-semibold text-slate-800">
                {slice.purchases}
                <span className="ml-1 font-normal text-slate-400">
                  {Math.round((slice.purchases / total) * 100)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
