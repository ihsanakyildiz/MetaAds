"use client";

import { useId, useMemo, useState } from "react";
import type { SalesDay } from "@/lib/sales-types";
import { formatMoney, formatNumber } from "@/lib/format";

const MONTHS = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
] as const;

type TrendChartProps = {
  days: SalesDay[];
  currency?: string | null;
};

export function TrendChart({ days, currency }: TrendChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const width = 920;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 36, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxPurchases = Math.max(...days.map((day) => day.purchases), 1);
  const maxSpend = Math.max(...days.map((day) => day.spend), 1);

  const points = useMemo(
    () =>
      days.map((day, index) => ({
        x:
          padding.left +
          (days.length <= 1
            ? innerWidth / 2
            : (index / (days.length - 1)) * innerWidth),
        y: padding.top + innerHeight - (day.purchases / maxPurchases) * innerHeight,
        barH: (day.spend / maxSpend) * (innerHeight * 0.72),
        day,
      })),
    [days, innerHeight, innerWidth, maxPurchases, maxSpend, padding.left, padding.top],
  );

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const area =
    points.length === 0
      ? ""
      : `${line} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;
  const labelStep = Math.max(1, Math.ceil(days.length / 7));
  const active = hover === null ? null : points[hover];
  const barWidth = Math.max(4, innerWidth / Math.max(days.length, 1) * 0.55);

  if (days.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
        Bu aralıkta günlük kayıt yok.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[280px] w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * width;
          let closest = 0;
          let distance = Number.POSITIVE_INFINITY;
          points.forEach((point, index) => {
            const next = Math.abs(point.x - x);
            if (next < distance) {
              distance = next;
              closest = index;
            }
          });
          setHover(closest);
        }}
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1877F2" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1877F2" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.map((point, index) => (
          <rect
            key={`bar-${point.day.date}`}
            x={point.x - barWidth / 2}
            y={padding.top + innerHeight - point.barH}
            width={barWidth}
            height={point.barH}
            rx="3"
            fill={hover === index ? "#93c5fd" : "#dbeafe"}
          />
        ))}
        <path d={area} fill={`url(#${gradientId}-fill)`} />
        <path d={line} fill="none" stroke="#1877F2" strokeWidth="2.5" />
        {points.map((point, index) =>
          index % labelStep === 0 || index === points.length - 1 ? (
            <text
              key={point.day.date}
              x={point.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-400"
              fontSize="11"
            >
              {(() => {
                const [, month, day] = point.day.date.split("-").map(Number);
                return `${day} ${MONTHS[(month ?? 1) - 1]}`;
              })()}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-blue-200" />
          Günlük harcama
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-accent" />
          Günlük satış adedi
        </span>
      </div>
      {active ? (
        <div className="pointer-events-none absolute top-3 right-3 rounded-xl border border-line bg-white/95 px-3 py-2 text-xs shadow-sm">
          <p className="font-medium text-slate-800">{active.day.date}</p>
          <p className="mt-1 text-slate-500">
            {formatNumber(active.day.purchases)} satış ·{" "}
            {formatMoney(active.day.spend, currency)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
