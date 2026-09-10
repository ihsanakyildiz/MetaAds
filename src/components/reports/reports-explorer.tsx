"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  MousePointerClick,
  ShoppingBag,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { CloseSecretDialog } from "@/components/ads/close-secret-dialog";
import { DateRangePicker } from "@/components/campaigns/date-range-picker";
import { SalesChart } from "@/components/ads/sales-chart";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  budgetAlertKindLabel,
  guardActionLabel,
  guardActionTone,
} from "@/lib/budget-guard-types";
import { dateRangeSearchParams } from "@/lib/date-query";
import { resolveDateRange, type DateRangeValue } from "@/lib/date-range";
import {
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import {
  campaignStatusLabel,
  campaignStatusTone,
} from "@/lib/meta-labels";
import type { ReportPayload } from "@/lib/reports-types";

type ReportsExplorerProps = {
  canPause: boolean;
};

type TabId = "campaigns" | "adsets" | "products";

const EMPTY: ReportPayload | null = null;
const REPORT_PAGE_SIZE = 15;

export function ReportsExplorer({ canPause }: ReportsExplorerProps) {
  const [range, setRange] = useState<DateRangeValue>(() =>
    resolveDateRange("last_30d"),
  );
  const [report, setReport] = useState<ReportPayload | null>(EMPTY);
  const [tab, setTab] = useState<TabId>("campaigns");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pausingId, setPausingId] = useState("");
  const [pendingPause, setPendingPause] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pauseError, setPauseError] = useState("");

  async function loadReport(nextRange = range) {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      datePreset: nextRange.preset,
      since: nextRange.since,
      until: nextRange.until,
    });
    const response = await fetch(`/api/reports?${params.toString()}`, {
      credentials: "include",
      headers: { "ngrok-skip-browser-warning": "1" },
    });
    const data = (await response.json().catch(() => null)) as
      | (ReportPayload & { error?: string })
      | null;

    setLoading(false);

    if (!response.ok || !data || data.error) {
      setError(data?.error ?? "Rapor yüklenemedi.");
      return;
    }

    setReport(data);
  }

  function requestPause(adSetId: string, name: string) {
    setPauseError("");
    setPendingPause({ id: adSetId, name });
  }

  async function confirmPause(password: string) {
    if (!pendingPause) {
      return;
    }

    setPausingId(pendingPause.id);
    setPauseError("");

    const response = await fetch("/api/adsets/pause", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adSetId: pendingPause.id,
        closePassword: password,
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setPausingId("");

    if (!response.ok) {
      setPauseError(data?.error ?? "Yetkiniz yok, bu işlemi yapamazsınız.");
      return;
    }

    setPendingPause(null);
    await loadReport();
  }

  useEffect(() => {
    void loadReport(range);
  }, [range.preset, range.since, range.until]);

  const currency = report?.currency;
  const diagnosisTone = useMemo(() => {
    switch (report?.diagnosis.tone) {
      case "danger":
        return "border-rose-200 bg-rose-50/70";
      case "warning":
        return "border-amber-200 bg-amber-50/70";
      case "success":
        return "border-emerald-200 bg-emerald-50/70";
      default:
        return "border-blue-200 bg-blue-50/70";
    }
  }, [report?.diagnosis.tone]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            Tüm hesaplar · kampanya, reklam seti ve ürün
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Karar motoru: para limiti, gün limiti, CTR ve ROAS birlikte okunur.
          </p>
        </div>
        <DateRangePicker value={range} onApply={setRange} />
      </div>

      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <CloseSecretDialog
        open={Boolean(pendingPause)}
        title={`“${pendingPause?.name ?? ""}” pasife alınacak`}
        confirmLabel="Pasife al"
        submitting={Boolean(pausingId)}
        error={pauseError}
        onCancel={() => {
          setPendingPause(null);
          setPauseError("");
        }}
        onConfirm={(password) => void confirmPause(password)}
      />

      {loading && !report ? (
        <p className="text-sm text-slate-500">Portföy raporu hazırlanıyor...</p>
      ) : null}

      {report ? (
        <>
          <section className={`rounded-3xl border p-6 ${diagnosisTone}`}>
            <p className="text-sm font-medium text-slate-600">Portföy teşhisi</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {report.diagnosis.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {report.diagnosis.summary}
            </p>
            {report.mixedCurrency ? (
              <p className="mt-3 text-xs text-slate-500">
                Birden fazla para birimi var; toplamlar ilk hesaba göre
                gösterilir.
              </p>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Toplam harcama"
              value={formatMoney(report.kpis.spend, currency)}
              hint={`${formatNumber(report.kpis.activeCampaigns)} aktif kampanya`}
              icon={CircleDollarSign}
              tone="accent"
            />
            <StatCard
              label="Satış"
              value={`${formatNumber(report.kpis.purchases)} adet`}
              hint={
                report.kpis.purchaseValue
                  ? formatMoney(report.kpis.purchaseValue, currency)
                  : "Ciro henüz yok"
              }
              icon={ShoppingBag}
              tone="success"
            />
            <StatCard
              label="ROAS"
              value={
                report.kpis.roas === null ? "—" : `${formatNumber(report.kpis.roas)}×`
              }
              hint={
                report.kpis.cpa === null
                  ? "Satış başı maliyet yok"
                  : `CPA ${formatMoney(report.kpis.cpa, currency)}`
              }
              icon={TrendingUp}
              tone={
                report.kpis.roas !== null && report.kpis.roas >= 1
                  ? "success"
                  : "warning"
              }
            />
            <StatCard
              label="Kapatılacak set"
              value={formatNumber(report.kpis.closeCount)}
              hint={
                report.kpis.wasteSpend
                  ? `${formatMoney(report.kpis.wasteSpend, currency)} riskli harcama`
                  : `${formatNumber(report.kpis.watchCount)} set izleniyor`
              }
              icon={ShieldAlert}
              tone={report.kpis.closeCount > 0 ? "warning" : "default"}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <MiniStat
              label="Tıklama"
              value={formatNumber(report.kpis.clicks)}
              hint={`CTR ${formatPercent(report.kpis.ctr)}`}
              icon={MousePointerClick}
            />
            <MiniStat
              label="Dönüşüm"
              value={
                report.kpis.cvr === null ? "—" : formatPercent(report.kpis.cvr)
              }
              hint={`${formatNumber(report.kpis.activeAdSets)} aktif set`}
              icon={Target}
            />
            <MiniStat
              label="Ölçeklenebilir"
              value={formatNumber(report.kpis.scaleCount)}
              hint="Satış + getiri sağlıklı"
              icon={Sparkles}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <ActionColumn
              title="Kapat"
              empty="Kapatılacak aktif set yok."
              tone="danger"
              items={report.close}
              currency={currency}
              canPause={canPause}
              pausingId={pausingId}
              onPause={requestPause}
            />
            <ActionColumn
              title="Süre ver"
              empty="İzlenen set yok."
              tone="warning"
              items={report.watch}
              currency={currency}
            />
            <ActionColumn
              title="Ölçekle"
              empty="Henüz net kazanan yok."
              tone="success"
              items={report.scale}
              currency={currency}
            />
          </section>

          <section className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <div>
                <h3 className="font-semibold">Günlük satış ritmi</h3>
                <p className="text-xs text-slate-500">
                  Penceredeki tüm setlerin birleşik satışı
                </p>
              </div>
            </div>
            {report.days.some((day) => day.purchases > 0) ? (
              <SalesChart days={report.days} currency={currency} />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">
                Bu aralıkta kayıtlı günlük satış yok. Bir kampanya sayfasını
                açınca grafik dolmaya başlar.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-card shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
            <div className="flex flex-wrap gap-2 border-b border-line px-6 py-4">
              <TabButton
                active={tab === "campaigns"}
                onClick={() => setTab("campaigns")}
                label={`Kampanyalar (${report.campaigns.length})`}
              />
              <TabButton
                active={tab === "adsets"}
                onClick={() => setTab("adsets")}
                label={`Reklam setleri (${report.adSets.length})`}
              />
              <TabButton
                active={tab === "products"}
                onClick={() => setTab("products")}
                label={`Ürünler (${report.products.length})`}
              />
            </div>

            {tab === "campaigns" ? (
              <CampaignTable
                rows={report.campaigns}
                currency={currency}
                dateQuery={dateRangeSearchParams(range)}
              />
            ) : null}
            {tab === "adsets" ? (
              <AdSetTable
                rows={report.adSets}
                currency={currency}
                dateQuery={dateRangeSearchParams(range)}
                canPause={canPause}
                pausingId={pausingId}
                onPause={requestPause}
              />
            ) : null}
            {tab === "products" ? (
              <ProductTable rows={report.products} currency={currency} />
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Sparkles;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs text-slate-400">{hint}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function ActionColumn({
  title,
  empty,
  tone,
  items,
  currency,
  canPause,
  pausingId,
  onPause,
}: {
  title: string;
  empty: string;
  tone: "danger" | "warning" | "success";
  items: ReportPayload["close"];
  currency?: string | null;
  canPause?: boolean;
  pausingId?: string;
  onPause?: (id: string, name: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <StatusBadge tone={tone}>{items.length}</StatusBadge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-line px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.campaignName}</p>
                </div>
                {item.decision ? (
                  <StatusBadge tone={guardActionTone(item.decision.action)}>
                    {guardActionLabel(item.decision.action)}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {item.decision?.detail ??
                  `${formatNumber(item.purchases)} satış · ${formatMoney(item.spend, currency)}`}
              </p>
              {canPause && onPause && item.decision?.action === "CLOSE" ? (
                <button
                  type="button"
                  disabled={pausingId === item.id}
                  onClick={() => onPause(item.id, item.name)}
                  className="mt-2 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {pausingId === item.id ? "Kapatılıyor..." : "Kapat"}
                </button>
              ) : (
                <Link
                  href={`/accounts/${item.accountId}/campaigns/${item.campaignId}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong"
                >
                  Setlere git
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function usePageSlice<T>(rows: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    pageCount,
    total: rows.length,
    slice: rows.slice(start, start + pageSize),
    setPage,
  };
}

function TablePager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3">
      <p className="text-xs text-slate-500">
        {from}–{to} / {formatNumber(total)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Önceki
        </button>
        <span className="text-xs text-slate-500">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Sonraki
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CampaignTable({
  rows,
  currency,
  dateQuery,
}: {
  rows: ReportPayload["campaigns"];
  currency?: string | null;
  dateQuery: string;
}) {
  const paged = usePageSlice(rows, REPORT_PAGE_SIZE);

  if (rows.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-sm text-slate-500">
        Kampanya yok.
      </p>
    );
  }

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-6 py-3 font-medium">Kampanya</th>
            <th className="px-6 py-3 font-medium">Durum</th>
            <th className="px-6 py-3 font-medium">Harcama</th>
            <th className="px-6 py-3 font-medium">Satış</th>
            <th className="px-6 py-3 font-medium">ROAS</th>
            <th className="px-6 py-3 font-medium">CPA</th>
            <th className="px-6 py-3 font-medium">CTR</th>
            <th className="px-6 py-3 font-medium">Karar</th>
          </tr>
        </thead>
        <tbody>
          {paged.slice.map((row) => (
            <tr key={row.id} className="border-t border-line hover:bg-slate-50">
              <td className="px-6 py-3">
                <Link
                  href={`/accounts/${row.accountId}/campaigns/${row.id}?${dateQuery}`}
                  className="block hover:text-accent"
                >
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-slate-400">{row.accountName}</p>
                </Link>
              </td>
              <td className="px-6 py-3">
                <StatusBadge tone={campaignStatusTone(row.status)}>
                  {campaignStatusLabel(row.status)}
                </StatusBadge>
              </td>
              <td className="px-6 py-3">{formatMoney(row.spend, currency)}</td>
              <td className="px-6 py-3">{formatNumber(row.purchases)}</td>
              <td className="px-6 py-3">
                {row.roas === null ? "—" : `${formatNumber(row.roas)}×`}
              </td>
              <td className="px-6 py-3">{formatMoney(row.cpa, currency)}</td>
              <td className="px-6 py-3">{formatPercent(row.ctr)}</td>
              <td className="px-6 py-3 text-xs text-slate-500">
                {row.closeCount > 0
                  ? `${row.closeCount} kapat`
                  : row.watchCount > 0
                    ? `${row.watchCount} izle`
                    : `${row.adSetCount} set`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <TablePager
      page={paged.page}
      pageCount={paged.pageCount}
      total={paged.total}
      pageSize={REPORT_PAGE_SIZE}
      onPage={paged.setPage}
    />
    </>
  );
}

function AdSetTable({
  rows,
  currency,
  dateQuery,
  canPause,
  pausingId,
  onPause,
}: {
  rows: ReportPayload["adSets"];
  currency?: string | null;
  dateQuery: string;
  canPause: boolean;
  pausingId: string;
  onPause: (id: string, name: string) => void;
}) {
  const paged = usePageSlice(rows, REPORT_PAGE_SIZE);

  if (rows.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-sm text-slate-500">
        Reklam seti yok.
      </p>
    );
  }

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-6 py-3 font-medium">Reklam seti</th>
            <th className="px-6 py-3 font-medium">Gün</th>
            <th className="px-6 py-3 font-medium">Harcama</th>
            <th className="px-6 py-3 font-medium">Satış</th>
            <th className="px-6 py-3 font-medium">ROAS</th>
            <th className="px-6 py-3 font-medium">CTR</th>
            <th className="px-6 py-3 font-medium">Karar</th>
            <th className="px-6 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {paged.slice.map((row) => (
            <tr key={row.id} className="border-t border-line hover:bg-slate-50">
              <td className="px-6 py-3">
                <Link
                  href={`/accounts/${row.accountId}/campaigns/${row.campaignId}?${dateQuery}`}
                  className="block hover:text-accent"
                >
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-slate-400">{row.campaignName}</p>
                </Link>
              </td>
              <td className="px-6 py-3 text-slate-600">
                {row.liveDays ? `${row.liveDays}. gün` : "—"}
              </td>
              <td className="px-6 py-3">{formatMoney(row.spend, currency)}</td>
              <td className="px-6 py-3">{formatNumber(row.purchases)}</td>
              <td className="px-6 py-3">
                {row.roas === null ? "—" : `${formatNumber(row.roas)}×`}
              </td>
              <td className="px-6 py-3">{formatPercent(row.ctr)}</td>
              <td className="px-6 py-3">
                {row.decision ? (
                  <div className="max-w-[220px]">
                    <StatusBadge tone={guardActionTone(row.decision.action)}>
                      {guardActionLabel(row.decision.action)}
                    </StatusBadge>
                    {row.decision.kind ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {budgetAlertKindLabel(row.decision.kind)}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-6 py-3">
                {canPause &&
                row.decision?.action === "CLOSE" &&
                row.status === "ACTIVE" ? (
                  <button
                    type="button"
                    disabled={pausingId === row.id}
                    onClick={() => onPause(row.id, row.name)}
                    className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {pausingId === row.id ? "..." : "Kapat"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <TablePager
      page={paged.page}
      pageCount={paged.pageCount}
      total={paged.total}
      pageSize={REPORT_PAGE_SIZE}
      onPage={paged.setPage}
    />
    </>
  );
}

function ProductTable({
  rows,
  currency,
}: {
  rows: ReportPayload["products"];
  currency?: string | null;
}) {
  const paged = usePageSlice(rows, REPORT_PAGE_SIZE);

  if (rows.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-sm text-slate-500">
        Ürün satışı henüz taranmadı. Bir kampanyada satış modalını açın.
      </p>
    );
  }

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-6 py-3 font-medium">Ürün</th>
            <th className="px-6 py-3 font-medium">Adet</th>
            <th className="px-6 py-3 font-medium">Ciro</th>
            <th className="px-6 py-3 font-medium">Harcama</th>
            <th className="px-6 py-3 font-medium">Tıklama</th>
          </tr>
        </thead>
        <tbody>
          {paged.slice.map((row) => (
            <tr
              key={row.productId}
              className="border-t border-line hover:bg-slate-50"
            >
              <td className="px-6 py-3">
                <p className="font-medium">{row.name ?? row.productId}</p>
                <p className="text-xs text-slate-400">{row.productId}</p>
              </td>
              <td className="px-6 py-3">{formatNumber(row.purchases)}</td>
              <td className="px-6 py-3">
                {formatMoney(row.purchaseValue, currency)}
              </td>
              <td className="px-6 py-3">{formatMoney(row.spend, currency)}</td>
              <td className="px-6 py-3">{formatNumber(row.clicks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <TablePager
      page={paged.page}
      pageCount={paged.pageCount}
      total={paged.total}
      pageSize={REPORT_PAGE_SIZE}
      onPage={paged.setPage}
    />
    </>
  );
}
