"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, RefreshCw, Search, ShieldAlert, ShoppingBag, Sparkles } from "lucide-react";
import { AdForm } from "@/components/ads/ad-form";
import { AdSetForm } from "@/components/ads/adset-form";
import { CloseSecretDialog } from "@/components/ads/close-secret-dialog";
import { SalesModal } from "@/components/ads/sales-modal";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ChildListItem, ChildStats } from "@/lib/children-types";
import {
  budgetAlertKindLabel,
  budgetAlertSeverityTone,
  guardActionLabel,
  guardActionTone,
  type BudgetGuardAlertView,
} from "@/lib/budget-guard-types";
import type { DateRangeValue } from "@/lib/date-range";
import {
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import {
  campaignStatusLabel,
  campaignStatusTone,
  optimizationGoalLabel,
} from "@/lib/meta-labels";

type ChildrenExplorerProps = {
  kind: "adset" | "ad";
  parentId: string;
  currency?: string | null;
  dateRange: DateRangeValue;
  itemHrefPrefix?: string;
  itemHrefQuery?: string;
  initialCount: number;
  canManage?: boolean;
  accountId?: string;
  parentObjective?: string | null;
  campaignHasBudget?: boolean;
};

const EMPTY_STATS: ChildStats = {
  count: 0,
  activeCount: 0,
  spend: 0,
  clicks: 0,
  impressions: 0,
  avgCtr: null,
  purchases: 0,
  sellProbability: null,
  previousProbability: null,
  probabilityDelta: null,
  salesDays: 0,
  trend: null,
};

export function ChildrenExplorer({
  kind,
  parentId,
  currency,
  dateRange,
  itemHrefPrefix,
  itemHrefQuery,
  initialCount,
  canManage = false,
  accountId,
  parentObjective,
  campaignHasBudget = false,
}: ChildrenExplorerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ChildListItem[]>([]);
  const [alerts, setAlerts] = useState<BudgetGuardAlertView[]>([]);
  const [stats, setStats] = useState<ChildStats>(EMPTY_STATS);
  const [salesOpen, setSalesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pausingId, setPausingId] = useState("");
  const [pendingPause, setPendingPause] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pauseError, setPauseError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChildListItem | null>(null);
  const autoStarted = useRef(false);

  const listPath = kind === "adset" ? "/api/adsets" : "/api/ads";
  const syncPath =
    kind === "adset" ? "/api/meta/adsets/sync" : "/api/meta/ads/sync";
  const parentKey = kind === "adset" ? "campaignId" : "adSetId";
  const title = kind === "adset" ? "Reklam setleri" : "Reklamlar";
  const extraLabel = kind === "adset" ? "Optimizasyon" : "Başlık";

  async function loadItems() {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      [parentKey]: parentId,
      datePreset: dateRange.preset,
      since: dateRange.since,
      until: dateRange.until,
    });

    if (query.trim()) {
      params.set("q", query.trim());
    }

    const response = await fetch(`${listPath}?${params.toString()}`, {
      credentials: "include",
      headers: { "ngrok-skip-browser-warning": "1" },
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      items?: ChildListItem[];
      stats?: ChildStats;
      alerts?: BudgetGuardAlertView[];
    } | null;

    setLoading(false);

    if (!response.ok) {
      setError(data?.error ?? `${title} yüklenemedi.`);
      return;
    }

    setItems(data?.items ?? []);
    setAlerts(kind === "adset" ? (data?.alerts ?? []) : []);
    if (data?.stats) {
      setStats(data.stats);
    }
  }

  async function syncItems() {
    setSyncing(true);
    setError("");

    const response = await fetch(syncPath, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({ [parentKey]: parentId }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setSyncing(false);

    if (!response.ok) {
      setError(data?.error ?? `${title} çekilemedi.`);
      return;
    }

    await loadItems();
  }

  function requestPause(adSetId: string, name: string) {
    setPauseError("");
    setPendingPause({ id: adSetId, name });
  }

  async function pauseAdSet(password: string) {
    if (!pendingPause) {
      return;
    }

    setPausingId(pendingPause.id);
    setError("");
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
    await loadItems();
  }

  useEffect(() => {
    void loadItems();
  }, [parentId, dateRange.preset, dateRange.since, dateRange.until]);

  useEffect(() => {
    if (initialCount > 0 || autoStarted.current) {
      return;
    }

    autoStarted.current = true;
    void syncItems();
  }, [initialCount]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadItems();
          }}
          className="relative min-w-[240px] flex-1"
        >
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-line py-2.5 pr-3 pl-9 outline-none ring-accent/30 focus:ring-4"
            placeholder={`${title} içinde ara`}
          />
        </form>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
          >
            <Plus className="h-4 w-4" />
            {kind === "adset" ? "Yeni reklam seti" : "Yeni reklam"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void syncItems()}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Çekiliyor..." : `${title} yenile`}
        </button>
      </div>

      {canManage && kind === "adset" ? (
        <AdSetForm
          open={formOpen}
          campaignId={parentId}
          accountId={accountId}
          currency={currency}
          objective={parentObjective}
          campaignHasBudget={campaignHasBudget}
          adSet={editingItem}
          onClose={() => {
            setFormOpen(false);
            setEditingItem(null);
          }}
          onSaved={(nextMessage) => {
            setMessage(nextMessage);
            void loadItems();
          }}
        />
      ) : null}
      {canManage && kind === "ad" ? (
        <AdForm
          open={formOpen}
          adSetId={parentId}
          accountId={accountId}
          ad={editingItem}
          onClose={() => {
            setFormOpen(false);
            setEditingItem(null);
          }}
          onSaved={(nextMessage) => {
            setMessage(nextMessage);
            void loadItems();
          }}
        />
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
        onConfirm={(password) => void pauseAdSet(password)}
      />

      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {kind === "adset" && alerts.length > 0 ? (
        <BudgetAlertList
          alerts={alerts}
          currency={currency}
          pausingId={pausingId}
          onAcknowledged={(id) =>
            setAlerts((current) => current.filter((alert) => alert.id !== id))
          }
          onPause={(metaAdSetId) => {
            const item = items.find((row) => row.metaId === metaAdSetId);
            if (item) {
              requestPause(item.id, item.name);
            }
          }}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Summary label={title} value={formatNumber(stats.count)} />
        <Summary label="Aktif" value={formatNumber(stats.activeCount)} />
        <Summary
          label="Toplam harcama"
          value={formatMoney(stats.spend, currency)}
        />
        <Summary label="Toplam tıklama" value={formatNumber(stats.clicks)} />
        <button
          type="button"
          onClick={() => setSalesOpen(true)}
          className="rounded-2xl border border-accent/20 bg-[linear-gradient(180deg,#eef6ff_0%,#ffffff_70%)] p-5 text-left shadow-[0_10px_30px_rgba(16,32,51,0.04)] ring-accent/20 transition hover:-translate-y-0.5 hover:ring-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Toplam satış</p>
              <p className="mt-2 text-xl font-semibold tracking-tight">
                {formatNumber(stats.purchases)} adet
              </p>
              <p className="mt-2 text-xs text-accent">
                {stats.salesDays > 0
                  ? `${stats.salesDays} günde satış · grafiği aç`
                  : "Günlük dalgalanmayı gör"}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-accent">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>
        </button>
        <Summary
          label="Satma olasılığı"
          value={
            stats.sellProbability === null
              ? "—"
              : formatPercent(stats.sellProbability)
          }
          hint={
            stats.probabilityDelta === null
              ? undefined
              : `${stats.probabilityDelta > 0 ? "+" : ""}${stats.probabilityDelta.toFixed(1)} puan`
          }
          icon={Sparkles}
        />
      </section>

      <SalesModal
        open={salesOpen}
        onClose={() => setSalesOpen(false)}
        scope={kind === "adset" ? "campaign" : "adset"}
        parentId={parentId}
        since={dateRange.since}
        until={dateRange.until}
        currency={currency}
        title={
          kind === "adset"
            ? "Kampanya ürün satışları"
            : "Reklam seti ürün satışları"
        }
      />

      <section className="rounded-2xl border border-line bg-card shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "Yükleniyor..." : `${items.length} kayıt`}
          </p>
        </div>
        {items.length === 0 && !loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Bu {kind === "adset" ? "kampanyada reklam seti" : "reklam setinde reklam"}{" "}
            yok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">
                    {kind === "adset" ? "Reklam seti" : "Reklam"}
                  </th>
                  <th className="px-6 py-3 font-medium">{extraLabel}</th>
                  <th className="px-6 py-3 font-medium">Durum</th>
                  {kind === "adset" ? (
                    <th className="px-6 py-3 font-medium">Bütçe</th>
                  ) : null}
                  <th className="px-6 py-3 font-medium">Harcama</th>
                  <th className="px-6 py-3 font-medium">Satış</th>
                  <th className="px-6 py-3 font-medium">Tıklama</th>
                  <th className="px-6 py-3 font-medium">CTR</th>
                  {kind === "adset" ? (
                    <th className="px-6 py-3 font-medium">Karar</th>
                  ) : null}
                  {canManage ? (
                    <th className="px-6 py-3 font-medium">İşlem</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const name = (
                    <div className="flex items-center gap-3">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : null}
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.metaId}</p>
                      </div>
                    </div>
                  );

                  return (
                    <tr
                      key={item.id}
                      className="border-t border-line hover:bg-slate-50"
                    >
                      <td className="px-6 py-3">
                        {itemHrefPrefix ? (
                          <Link
                            href={`${itemHrefPrefix}${item.id}${itemHrefQuery ? `?${itemHrefQuery}` : ""}`}
                            className="block hover:text-accent"
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {kind === "adset"
                          ? optimizationGoalLabel(item.extra)
                          : item.extra ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge
                          tone={campaignStatusTone(item.effectiveStatus)}
                        >
                          {campaignStatusLabel(item.effectiveStatus)}
                        </StatusBadge>
                      </td>
                      {kind === "adset" ? (
                        <td className="px-6 py-3 text-slate-600">
                          {item.dailyBudget
                            ? `${formatMoney(item.dailyBudget, currency, true)} / gün`
                            : item.lifetimeBudget
                              ? `${formatMoney(item.lifetimeBudget, currency, true)} toplam`
                              : "—"}
                        </td>
                      ) : null}
                      <td className="px-6 py-3 text-slate-600">
                        {formatMoney(item.spend, currency)}
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {kind === "adset"
                          ? `${formatNumber(item.purchases)} adet`
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {formatNumber(item.clicks)}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {formatPercent(item.ctr)}
                      </td>
                      {kind === "adset" ? (
                        <td className="px-6 py-3">
                          <AdSetDecision
                            decision={item.decision}
                            pausing={pausingId === item.id}
                            onPause={
                              item.decision?.action === "CLOSE" &&
                              item.effectiveStatus === "ACTIVE"
                                ? () => requestPause(item.id, item.name)
                                : undefined
                            }
                          />
                        </td>
                      ) : null}
                      {canManage ? (
                        <td className="px-6 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setFormOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Düzenle
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AdSetDecision({
  decision,
  pausing,
  onPause,
}: {
  decision: ChildListItem["decision"];
  pausing: boolean;
  onPause?: () => void;
}) {
  if (!decision) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="min-w-[160px] space-y-2">
      <StatusBadge tone={guardActionTone(decision.action)}>
        {guardActionLabel(decision.action)}
      </StatusBadge>
      <p className="text-xs leading-5 text-slate-500">{decision.detail}</p>
      {onPause ? (
        <button
          type="button"
          disabled={pausing}
          onClick={onPause}
          className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {pausing ? "Kapatılıyor..." : "Kapat"}
        </button>
      ) : null}
    </div>
  );
}

function BudgetAlertList({
  alerts,
  currency,
  pausingId,
  onAcknowledged,
  onPause,
}: {
  alerts: BudgetGuardAlertView[];
  currency?: string | null;
  pausingId: string;
  onAcknowledged: (id: string) => void;
  onPause: (metaAdSetId: string) => void;
}) {
  const [pendingId, setPendingId] = useState("");

  async function acknowledge(id: string) {
    setPendingId(id);
    const response = await fetch("/api/alerts/budget-guard", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPendingId("");

    if (response.ok) {
      onAcknowledged(id);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-700" />
        <div>
          <h2 className="font-semibold text-amber-950">
            Kapatılması gereken setler — {alerts.length}
          </h2>
          <p className="text-xs text-amber-800/80">
            Sadece kapatma önerisi olan reklam setleri listelenir.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <article
            key={alert.id}
            className="rounded-xl border border-amber-200/80 bg-white px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={budgetAlertSeverityTone(alert.severity)}>
                    {budgetAlertKindLabel(alert.kind)}
                  </StatusBadge>
                  <p className="font-medium">{alert.title}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {alert.message}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {alert.recommendation}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {alert.adSetName}
                  {" · "}
                  {formatMoney(alert.spend, currency)}
                  {" · "}
                  {formatNumber(alert.purchases)} satış
                  {" · "}
                  {formatNumber(alert.clicks)} tıklama
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  disabled={Boolean(pausingId)}
                  onClick={() => onPause(alert.metaAdSetId)}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {pausingId ? "Kapatılıyor..." : "Kapat"}
                </button>
                <button
                  type="button"
                  disabled={pendingId === alert.id}
                  onClick={() => void acknowledge(alert.id)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {pendingId === alert.id ? "İşleniyor..." : "Gördüm"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Summary({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: typeof Sparkles;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="mt-2 text-xs text-slate-400">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
