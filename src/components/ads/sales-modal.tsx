"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { DayProductsModal } from "@/components/ads/day-products-modal";
import { ProductIdChips } from "@/components/ads/product-id-chips";
import { SalesChart } from "@/components/ads/sales-chart";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { SalesDay, SalesPayload } from "@/lib/sales-types";

type SalesModalProps = {
  open: boolean;
  onClose: () => void;
  scope: "campaign" | "adset";
  parentId: string;
  since: string;
  until: string;
  currency?: string | null;
  title: string;
};

function trendLabel(trend: SalesPayload["analysis"]["trend"]) {
  switch (trend) {
    case "UP":
      return "Yükselişte";
    case "DOWN":
      return "Düşüşte";
    case "STABLE":
      return "Stabil";
    default: {
      const _exhaustive: never = trend;
      return _exhaustive;
    }
  }
}

function probabilityTone(value: number) {
  if (value >= 60) {
    return "text-emerald-700 bg-emerald-50 border-emerald-100";
  }

  if (value >= 30) {
    return "text-amber-700 bg-amber-50 border-amber-100";
  }

  return "text-rose-700 bg-rose-50 border-rose-100";
}

export function SalesModal({
  open,
  onClose,
  scope,
  parentId,
  since,
  until,
  currency,
  title,
}: SalesModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<SalesPayload | null>(null);
  const [selectedDay, setSelectedDay] = useState<SalesDay | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !selectedDay) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, selectedDay]);

  useEffect(() => {
    if (!open) {
      setSelectedDay(null);
      return;
    }

    let cancelled = false;

    async function loadSales() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        scope,
        id: parentId,
        since,
        until,
      });
      const response = await fetch(`/api/sales/daily?${params.toString()}`, {
        credentials: "include",
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      const data = (await response.json().catch(() => null)) as
        | (SalesPayload & { error?: string })
        | null;

      if (cancelled) {
        return;
      }

      setLoading(false);

      if (!response.ok || !data) {
        setError(data?.error ?? "Satış grafiği yüklenemedi.");
        return;
      }

      setPayload(data);
    }

    void loadSales();

    return () => {
      cancelled = true;
    };
  }, [open, parentId, scope, since, until]);

  const saleDays = useMemo(
    () => (payload?.days ?? []).filter((day) => day.purchases > 0),
    [payload],
  );

  if (!open) {
    return null;
  }

  const analysis = payload?.analysis;
  const sellers = (payload?.sellers ?? [])
    .filter((seller) => seller.purchases > 0)
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(16,32,51,0.22)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
              Günlük satış dalgalanması
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
            {analysis?.lastAnalyzedAt ? (
              <p className="mt-1 text-sm text-slate-500">
                Son analiz {formatDate(analysis.lastAnalyzedAt)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          {analysis ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div
                className={`rounded-2xl border px-4 py-4 ${probabilityTone(analysis.sellProbability)}`}
              >
                <p className="text-sm opacity-80">Satma olasılığı</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight">
                  {formatPercent(analysis.sellProbability)}
                </p>
                <p className="mt-2 flex items-center gap-1 text-xs">
                  {analysis.trend === "DOWN" ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5" />
                  )}
                  {trendLabel(analysis.trend)}
                  {analysis.probabilityDelta !== null
                    ? ` · ${analysis.probabilityDelta > 0 ? "+" : ""}${analysis.probabilityDelta.toFixed(1)} puan`
                    : ""}
                </p>
              </div>
              <MiniStat
                label="Toplam satış"
                value={`${formatNumber(analysis.totalPurchases)} adet`}
              />
              <MiniStat
                label="Satış yapılan gün"
                value={formatNumber(analysis.salesDays)}
              />
              <MiniStat
                label="Günlük ortalama"
                value={`${analysis.avgDailyPurchases.toLocaleString("tr-TR")} adet`}
              />
            </div>
          ) : null}

          <section className="rounded-2xl border border-line bg-slate-50/70 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">Satılan ürün ID’leri</h3>
              <p className="mt-1 text-xs text-slate-500">
                Bir ID’nin üzerine gelince ürün adı, ülke pasta dilimi ve alıcı
                cinsiyeti görünür.
              </p>
            </div>
            <ProductIdChips
              products={payload?.products}
              currency={currency}
              scope={scope}
              parentId={parentId}
              since={since}
              until={until}
            />
          </section>

          <div className="rounded-3xl border border-line bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_48%)] p-4">
            {loading && !payload ? (
              <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">
                Günlük satışlar hazırlanıyor...
              </div>
            ) : (
              <SalesChart days={payload?.days ?? []} currency={currency} />
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MiniStat
              label="Dönüşüm oranı"
              value={formatPercent(analysis?.conversionRate)}
            />
            <MiniStat
              label="Satış tutarlılığı"
              value={formatPercent(analysis?.consistency)}
            />
            <MiniStat
              label="Satış isabeti"
              value={formatPercent(analysis?.hitRate)}
              hint="Harcama olan günlerin kaçı satış getirdi"
            />
          </div>

          {sellers.length > 0 && scope === "campaign" ? (
            <section>
              <h3 className="text-sm font-semibold">Satan reklam setleri</h3>
              <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
                {sellers.map((seller) => (
                  <div
                    key={seller.metaId}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{seller.name}</p>
                      <p className="text-xs text-slate-400">{seller.metaId}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatNumber(seller.purchases)} adet
                      </p>
                      <p className="text-xs text-slate-500">
                        Olasılık {formatPercent(seller.sellProbability)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold">Satış yapılan günler</h3>
            <p className="mt-1 text-xs text-slate-500">
              Satış adetine tıklayınca o gün hangi ürünlerin sattığı açılır.
            </p>
            {saleDays.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Seçilen aralıkta satış günü bulunamadı.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Gün</th>
                      <th className="px-4 py-3 font-medium">Adet</th>
                      <th className="px-4 py-3 font-medium">Satış tutarı</th>
                      <th className="px-4 py-3 font-medium">Harcama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleDays.map((day) => (
                      <tr key={day.date} className="border-t border-line">
                        <td className="px-4 py-3">
                          <p className="font-medium">{formatDate(day.date)}</p>
                          <p className="text-xs text-slate-400">{day.weekday}</p>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedDay(day)}
                            className="font-semibold text-accent underline-offset-2 hover:underline"
                          >
                            {formatNumber(day.purchases)} adet
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatMoney(day.purchaseValue, currency)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatMoney(day.spend, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      <DayProductsModal
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        date={selectedDay?.date ?? since}
        weekday={selectedDay?.weekday ?? ""}
        purchases={selectedDay?.purchases ?? 0}
        scope={scope}
        parentId={parentId}
        currency={currency}
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-slate-50/80 px-4 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
