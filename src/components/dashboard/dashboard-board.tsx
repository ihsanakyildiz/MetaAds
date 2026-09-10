"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CircleDollarSign,
  Megaphone,
  MousePointerClick,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { DateRangePicker } from "@/components/campaigns/date-range-picker";
import { RankChart } from "@/components/dashboard/rank-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { ProbabilityRing } from "@/components/creatives/probability-ring";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  budgetAlertKindLabel,
  budgetAlertSeverityTone,
} from "@/lib/budget-guard-types";
import type { DashboardPayload } from "@/lib/dashboard-types";
import { resolveDateRange, type DateRangeValue } from "@/lib/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

function insightClass(tone: DashboardPayload["insight"]["tone"]) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50/80";
    case "warning":
      return "border-amber-200 bg-amber-50/80";
    case "accent":
      return "border-blue-200 bg-blue-50/80";
    case "neutral":
      return "border-line bg-slate-50";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function DashboardBoard() {
  const [range, setRange] = useState<DateRangeValue>(() =>
    resolveDateRange("last_30d"),
  );
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextRange = range) {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      datePreset: nextRange.preset,
      since: nextRange.since,
      until: nextRange.until,
    });
    const response = await fetch(`/api/dashboard?${params.toString()}`, {
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as
      | (DashboardPayload & { error?: string })
      | null;

    setLoading(false);

    if (!response.ok || !payload || payload.error) {
      setError(payload?.error ?? "Dashboard yüklenemedi.");
      return;
    }

    setData(payload);
  }

  useEffect(() => {
    void load(range);
  }, [range]);

  const kpis = data?.kpis;
  const currency = data?.currency;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {data
            ? `${data.since} — ${data.until}${data.mixedCurrency ? " · karışık para birimi" : ""}`
            : "Portföy özeti yükleniyor"}
        </p>
        <DateRangePicker value={range} onApply={setRange} />
      </div>

      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {data ? (
        <section className={`rounded-3xl border p-6 ${insightClass(data.insight.tone)}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Dönem özeti
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {data.insight.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {data.insight.detail}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Harcama"
          value={loading ? "…" : formatMoney(kpis?.spend, currency)}
          hint="Kampanya günlük kayıtları"
          icon={CircleDollarSign}
          tone="accent"
        />
        <StatCard
          label="Satış"
          value={loading ? "…" : formatNumber(kpis?.purchases)}
          hint={
            kpis?.cpa
              ? `CPA ${formatMoney(kpis.cpa, currency)}`
              : "Adet satın alma"
          }
          icon={ShoppingBag}
          tone="success"
        />
        <StatCard
          label="ROAS"
          value={
            loading ? "…" : kpis?.roas === null || kpis?.roas === undefined
              ? "—"
              : `${kpis.roas.toFixed(2)}x`
          }
          hint="Gelir / harcama"
          icon={Sparkles}
        />
        <StatCard
          label="Aktif kampanya"
          value={loading ? "…" : formatNumber(kpis?.activeCampaigns)}
          hint={`${kpis?.campaignCount ?? 0} toplam · ${kpis?.adSetCount ?? 0} set`}
          icon={Megaphone}
        />
        <StatCard
          label="Ort. satış olasılığı"
          value={
            loading || kpis?.avgSellProbability === null || kpis?.avgSellProbability === undefined
              ? "—"
              : formatPercent(kpis.avgSellProbability)
          }
          hint={`${formatNumber(kpis?.clicks)} tıklama`}
          icon={MousePointerClick}
          tone="warning"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <article className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)] xl:col-span-3">
          <h3 className="font-semibold">Günlük satış ve harcama</h3>
          <p className="mt-1 text-sm text-slate-500">
            Çubuklar harcama, çizgi satış adedi
          </p>
          <div className="mt-4">
            <TrendChart days={data?.days ?? []} currency={currency} />
          </div>
        </article>
        <div className="xl:col-span-2">
          <RankChart
            title="En iyi kampanyalar"
            hint="Satış adedine göre"
            href="/campaigns"
            rows={data?.topCampaigns ?? []}
            empty="Bu dönemde satışlı kampanya yok."
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RankChart
          title="En iyi satış yapan setler"
          hint="Satış ve satış olasılığı"
          href="/reports"
          rows={data?.topAdSets ?? []}
          empty="Reklam seti satışı henüz yok."
        />
        <RankChart
          title="Yüksek potansiyelli setler"
          hint="Satış olasılığına göre"
          href="/reports"
          rows={[...(data?.topAdSets ?? [])].sort(
            (left, right) =>
              (right.sellProbability ?? 0) - (left.sellProbability ?? 0),
          )}
          mode="probability"
          empty="Satış skoru hesaplanmış set yok."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <article className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)] xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">En güçlü reklamlar</h3>
              <p className="mt-1 text-sm text-slate-500">
                CTR ve tıklama hacmine göre
              </p>
            </div>
          </div>
          {(data?.topAds.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Reklam görselleri yenilendikten sonra burada listelenir.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data?.topAds.map((ad) => (
                <Link
                  key={ad.id}
                  href={ad.href}
                  className="flex gap-3 rounded-xl border border-line p-3 hover:border-accent/40"
                >
                  {ad.thumbnailUrl ? (
                    <img
                      src={ad.thumbnailUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-lg bg-slate-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ad.name}</p>
                    <p className="truncate text-xs text-slate-400">{ad.subtitle}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      CTR {ad.ctr === null ? "—" : formatPercent(ad.ctr)} ·{" "}
                      {formatNumber(ad.clicks)} tıklama
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)] xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">En çok satan ürünler</h3>
              <p className="mt-1 text-sm text-slate-500">Katalog kırılımı</p>
            </div>
          </div>
          {(data?.topProducts.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Ürün satışı henüz çekilmedi.
            </p>
          ) : (
            <ol className="space-y-3">
              {data?.topProducts.map((product, index) => (
                <li key={product.name} className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {index + 1}. {product.name}
                  </span>
                  <span className="shrink-0 text-sm text-slate-500">
                    {formatNumber(product.purchases)} satış
                  </span>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Önerilen kreatifler</h3>
            <p className="mt-1 text-sm text-slate-500">
              Geçmiş görsellerin satış olasılığı
            </p>
          </div>
          <Link
            href="/creatives"
            className="text-sm font-medium text-accent hover:text-accent-strong"
          >
            Stüdyo
          </Link>
        </div>
        {(data?.topCreatives.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Kreatif analizi için reklamları yenileyin.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {data?.topCreatives.map((creative) => (
              <Link
                key={creative.id}
                href={creative.href}
                className="overflow-hidden rounded-xl border border-line hover:border-accent/40"
              >
                {creative.previewUrl ? (
                  <img
                    src={creative.previewUrl}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square bg-slate-100" />
                )}
                <div className="flex items-center justify-between gap-2 p-3">
                  <p className="truncate text-xs font-medium">{creative.name}</p>
                  <ProbabilityRing value={creative.sellProbability} size={52} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {data && data.alerts.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <h3 className="font-semibold text-amber-950">Kapatma uyarıları</h3>
          <div className="mt-3 space-y-2">
            {data.alerts.map((alert) => (
              <Link
                key={alert.id}
                href={
                  alert.accountId && alert.campaignId
                    ? `/accounts/${alert.accountId}/campaigns/${alert.campaignId}`
                    : "/campaigns"
                }
                className="block rounded-xl border border-amber-200/80 bg-white px-4 py-3"
              >
                <StatusBadge tone={budgetAlertSeverityTone(alert.severity)}>
                  {budgetAlertKindLabel(alert.kind)}
                </StatusBadge>
                <p className="mt-1 font-medium">{alert.title}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
