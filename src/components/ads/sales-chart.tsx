"use client";

import { useId, useMemo, useState } from "react";
import type { SalesDay } from "@/lib/sales-types";

type SalesChartProps = {
  days: SalesDay[];
  currency?: string | null;
};

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

function formatAxisDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]}`;
}

function formatFullDate(day: SalesDay) {
  const [year, month, date] = day.date.split("-");
  return `${date}.${month}.${year} ${day.weekday}`;
}

function catmullRomPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

export function SalesChart({ days, currency }: SalesChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 920;
  const height = 360;
  const padding = { top: 28, right: 28, bottom: 44, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxPurchases = Math.max(...days.map((day) => day.purchases), 1);
  const yMax = Math.max(1, Math.ceil(maxPurchases * 1.15));
  const average =
    days.length === 0
      ? 0
      : days.reduce((sum, day) => sum + day.purchases, 0) / days.length;

  const points = useMemo(
    () =>
      days.map((day, index) => ({
        x:
          padding.left +
          (days.length === 1 ? innerWidth / 2 : (index / (days.length - 1)) * innerWidth),
        y: padding.top + innerHeight - (day.purchases / yMax) * innerHeight,
        day,
      })),
    [days, innerHeight, innerWidth, padding.left, padding.top, yMax],
  );

  const linePath = catmullRomPath(points);
  const areaPath =
    points.length === 0
      ? ""
      : `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;
  const averageY =
    padding.top + innerHeight - (average / yMax) * innerHeight;
  const peak = points.reduce(
    (best, point) =>
      !best || point.day.purchases > best.day.purchases ? point : best,
    points[0],
  );
  const labelStep = Math.max(1, Math.ceil(days.length / 8));
  const active = hoverIndex === null ? null : points[hoverIndex];

  function nearestIndex(clientX: number, rect: DOMRect) {
    const x = ((clientX - rect.left) / rect.width) * width;
    let closest = 0;
    let distance = Number.POSITIVE_INFINITY;

    points.forEach((point, index) => {
      const next = Math.abs(point.x - x);
      if (next < distance) {
        distance = next;
        closest = index;
      }
    });

    return closest;
  }

  if (days.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">
        Bu aralıkta günlük satış kaydı yok.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[360px] w-full"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          setHoverIndex(
            nearestIndex(
              event.clientX,
              event.currentTarget.getBoundingClientRect(),
            ),
          );
        }}
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1877F2" stopOpacity="0.32" />
            <stop offset="70%" stopColor="#1877F2" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#1877F2" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0d65d8" />
            <stop offset="50%" stopColor="#1877F2" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        {Array.from({ length: 5 }, (_, index) => {
          const value = (yMax / 4) * index;
          const y = padding.top + innerHeight - (value / yMax) * innerHeight;

          return (
            <g key={value}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e4ebf3"
                strokeDasharray="4 6"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400"
                fontSize="11"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={averageY}
          y2={averageY}
          stroke="#94a3b8"
          strokeDasharray="6 6"
        />
        <text
          x={width - padding.right}
          y={averageY - 6}
          textAnchor="end"
          className="fill-slate-400"
          fontSize="11"
        >
          Ort. {average.toFixed(1)} adet
        </text>

        <path d={areaPath} fill={`url(#${gradientId}-fill)`} />
        <path
          d={linePath}
          fill="none"
          stroke={`url(#${gradientId}-stroke)`}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) =>
          index % labelStep === 0 || index === points.length - 1 ? (
            <text
              key={point.day.date}
              x={point.x}
              y={height - 14}
              textAnchor="middle"
              className="fill-slate-400"
              fontSize="11"
            >
              {formatAxisDate(point.day.date)}
            </text>
          ) : null,
        )}

        {peak && peak.day.purchases > 0 ? (
          <g>
            <circle cx={peak.x} cy={peak.y} r="6" fill="#0d65d8" />
            <text
              x={peak.x}
              y={peak.y - 12}
              textAnchor="middle"
              className="fill-slate-700"
              fontSize="11"
              fontWeight="600"
            >
              Zirve {peak.day.purchases} adet
            </text>
          </g>
        ) : null}

        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={padding.top}
              y2={padding.top + innerHeight}
              stroke="#1877F2"
              strokeOpacity="0.35"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="7"
              fill="#ffffff"
              stroke="#1877F2"
              strokeWidth="3"
            />
          </g>
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-4 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_18px_40px_rgba(16,32,51,0.12)]"
          style={{
            left: `${Math.min(78, Math.max(8, (active.x / width) * 100 - 12))}%`,
          }}
        >
          <p className="text-xs font-medium text-slate-500">
            {formatFullDate(active.day)}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {active.day.purchases} adet satış
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Harcama{" "}
            {currency
              ? new Intl.NumberFormat("tr-TR", {
                  style: "currency",
                  currency,
                  maximumFractionDigits: 2,
                }).format(active.day.spend)
              : active.day.spend.toLocaleString("tr-TR")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
