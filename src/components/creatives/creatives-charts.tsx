"use client";

import type {
  CreativeBucket,
  CreativeKindStat,
  CreativesPayload,
} from "@/lib/creatives-types";

const BAR_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#e11d48", "#0ea5e9", "#65a30d", "#db2777"];

function probabilityFill(value: number) {
  if (value >= 55) {
    return "#059669";
  }

  if (value >= 35) {
    return "#d97706";
  }

  return "#e11d48";
}

export function CreativesCharts({
  distribution,
  kindStats,
  topBars,
}: {
  distribution: CreativeBucket[];
  kindStats: CreativeKindStat[];
  topBars: CreativesPayload["topBars"];
}) {
  const maxDist = Math.max(...distribution.map((bucket) => bucket.count), 1);
  const maxKind = Math.max(...kindStats.map((row) => row.avgProbability), 1);
  const maxTop = Math.max(...topBars.map((row) => row.probability), 1);

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <article className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <h3 className="font-semibold">Satış olasılığı dağılımı</h3>
        <p className="mt-1 text-sm text-slate-500">
          Kreatiflerin yüzde aralıklarına göre adedi
        </p>
        <div className="mt-5 flex h-44 items-end gap-2">
          {distribution.map((bucket, index) => {
            const height = (bucket.count / maxDist) * 100;
            return (
              <div key={bucket.key} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-500">{bucket.count}</span>
                <div className="flex h-32 w-full items-end rounded-t-lg bg-slate-100">
                  <div
                    className="w-full rounded-t-lg"
                    style={{
                      height: `${Math.max(height, bucket.count > 0 ? 8 : 0)}%`,
                      background: BAR_COLORS[index],
                    }}
                  />
                </div>
                <span className="text-[11px] text-slate-500">{bucket.label}</span>
              </div>
            );
          })}
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <h3 className="font-semibold">Görsel vs video</h3>
        <p className="mt-1 text-sm text-slate-500">
          Geçmiş Meta kreatiflerin ortalama satış olasılığı
        </p>
        <div className="mt-6 space-y-5">
          {kindStats.map((row) => (
            <div key={row.kind}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {row.kind === "VIDEO" ? "Video" : "Görsel / banner"}
                </span>
                <span className="text-slate-500">
                  %{row.avgProbability.toFixed(0)} · {row.count} adet
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(row.avgProbability / maxKind) * 100}%`,
                    background: row.kind === "VIDEO" ? "#7c3aed" : "#2563eb",
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {row.purchases} satış bu formata bağlandı
              </p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <h3 className="font-semibold">En güçlü 8 kreatif</h3>
        <p className="mt-1 text-sm text-slate-500">Satış alma olasılığına göre</p>
        <div className="mt-4 space-y-2.5">
          {topBars.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div>
                <p className="truncate text-sm font-medium text-slate-700">{row.name}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(row.probability / maxTop) * 100}%`,
                      background: probabilityFill(row.probability),
                    }}
                  />
                </div>
              </div>
              <span className="w-12 text-right text-sm font-semibold text-slate-700">
                %{Math.round(row.probability)}
              </span>
            </div>
          ))}
          {topBars.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz sıralanacak kreatif yok.</p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
