"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { DateRangePicker } from "@/components/campaigns/date-range-picker";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CAMPAIGN_PAGE_SIZE,
  type CampaignListItem,
  type CampaignSort,
  type CampaignStats,
} from "@/lib/campaigns";
import { dateRangeSearchParams } from "@/lib/date-query";
import { resolveDateRange, type DateRangeValue } from "@/lib/date-range";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import {
  campaignObjectiveLabel,
  campaignStatusLabel,
  campaignStatusTone,
} from "@/lib/meta-labels";

type Facets = {
  statuses: string[];
  objectives: string[];
  maximumSince?: string;
};

type FiltersState = {
  query: string;
  status: string;
  objective: string;
  minSpend: string;
  maxSpend: string;
  minClicks: string;
  onlyWithSpend: boolean;
  sort: CampaignSort;
  datePreset: DateRangeValue["preset"];
  since: string;
  until: string;
};

function createDefaultFilters(): FiltersState {
  const range = resolveDateRange("last_30d");

  return {
    query: "",
    status: "",
    objective: "",
    minSpend: "",
    maxSpend: "",
    minClicks: "",
    onlyWithSpend: false,
    sort: "spend",
    datePreset: range.preset,
    since: range.since,
    until: range.until,
  };
}

const EMPTY_STATS: CampaignStats = {
  count: 0,
  activeCount: 0,
  spend: 0,
  clicks: 0,
  impressions: 0,
  avgCtr: null,
};

type CampaignExplorerProps = {
  accountId?: string;
  currency?: string | null;
  timeZone?: string | null;
  showAccountColumn?: boolean;
  autoSync?: boolean;
  initialCount?: number;
  canManage?: boolean;
};

function buildSearchParams(
  filters: FiltersState,
  page: number,
  accountId?: string,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(CAMPAIGN_PAGE_SIZE),
    sort: filters.sort,
  });

  if (accountId) {
    params.set("accountId", accountId);
  }
  if (filters.query.trim()) {
    params.set("q", filters.query.trim());
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.objective) {
    params.set("objective", filters.objective);
  }
  if (filters.minSpend) {
    params.set("minSpend", filters.minSpend);
  }
  if (filters.maxSpend) {
    params.set("maxSpend", filters.maxSpend);
  }
  if (filters.minClicks) {
    params.set("minClicks", filters.minClicks);
  }
  if (filters.onlyWithSpend) {
    params.set("onlyWithSpend", "1");
  }
  if (filters.datePreset) {
    params.set("datePreset", filters.datePreset);
  }
  if (filters.since) {
    params.set("since", filters.since);
  }
  if (filters.until) {
    params.set("until", filters.until);
  }

  return params;
}

export function CampaignExplorer({
  accountId,
  currency,
  timeZone,
  showAccountColumn = false,
  autoSync = false,
  initialCount = 0,
  canManage = false,
}: CampaignExplorerProps) {
  const [filters, setFilters] = useState<FiltersState>(createDefaultFilters);
  const [applied, setApplied] = useState<FiltersState>(createDefaultFilters);
  const [items, setItems] = useState<CampaignListItem[]>([]);
  const [stats, setStats] = useState<CampaignStats>(EMPTY_STATS);
  const [facets, setFacets] = useState<Facets>({ statuses: [], objectives: [] });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignListItem | null>(
    null,
  );
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const autoStarted = useRef(false);

  const loadPage = useCallback(
    async (nextPage: number, nextFilters: FiltersState, replace: boolean) => {
      if (loadingRef.current) {
        return;
      }

      loadingRef.current = true;
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/campaigns?${buildSearchParams(nextFilters, nextPage, accountId).toString()}`,
        {
          credentials: "include",
          headers: { "ngrok-skip-browser-warning": "1" },
        },
      );
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        items?: CampaignListItem[];
        hasMore?: boolean;
        stats?: CampaignStats;
        facets?: Facets | null;
      } | null;

      loadingRef.current = false;
      setLoading(false);

      if (!response.ok) {
        setError(data?.error ?? "Kampanyalar yüklenemedi.");
        return;
      }

      setItems((current) =>
        replace ? (data?.items ?? []) : [...current, ...(data?.items ?? [])],
      );
      setHasMore(Boolean(data?.hasMore));
      setPage(nextPage);
      if (data?.stats) {
        setStats(data.stats);
      }
      if (data?.facets) {
        setFacets(data.facets);
      }
    },
    [accountId],
  );

  useEffect(() => {
    void loadPage(1, applied, true);
  }, [applied, loadPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRootRef.current;

    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current) {
          void loadPage(page + 1, applied, false);
        }
      },
      { root, rootMargin: "240px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [applied, hasMore, loadPage, page]);

  async function syncCampaigns() {
    if (!accountId) {
      return;
    }

    setSyncing(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/meta/campaigns/sync", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({ accountId }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      count?: number;
    } | null;

    setSyncing(false);

    if (!response.ok) {
      setError(data?.error ?? "Kampanyalar çekilemedi.");
      return;
    }

    setMessage(`${data?.count ?? 0} kampanya güncellendi.`);
    void loadPage(1, applied, true);
  }

  useEffect(() => {
    if (!autoSync || !accountId || initialCount > 0 || autoStarted.current) {
      return;
    }

    autoStarted.current = true;
    void syncCampaigns();
  }, [accountId, autoSync, initialCount]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        applied.query ||
          applied.status ||
          applied.objective ||
          applied.minSpend ||
          applied.maxSpend ||
          applied.minClicks ||
          applied.onlyWithSpend ||
          applied.sort !== "spend",
      ),
    [applied],
  );

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItems([]);
    setApplied({ ...filters });
  }

  function applyDateRange(range: DateRangeValue) {
    const next = {
      ...filters,
      datePreset: range.preset,
      since: range.since,
      until: range.until,
    };
    setFilters(next);
    setItems([]);
    setApplied(next);
  }

  function clearFilters() {
    const next = {
      ...createDefaultFilters(),
      datePreset: filters.datePreset,
      since: filters.since,
      until: filters.until,
    };
    setFilters(next);
    setItems([]);
    setApplied(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <DateRangePicker
          value={{
            preset: applied.datePreset,
            since: applied.since,
            until: applied.until,
          }}
          timeZone={timeZone}
          maximumSince={facets.maximumSince}
          onApply={applyDateRange}
        />
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditingCampaign(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
          >
            <Plus className="h-4 w-4" />
            Yeni kampanya
          </button>
        ) : null}
        {accountId ? (
          <button
            type="button"
            onClick={() => void syncCampaigns()}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Kampanyalar çekiliyor..." : "Kampanyaları yenile"}
          </button>
        ) : null}
      </div>

      {canManage ? (
        <CampaignForm
          open={formOpen}
          accountId={accountId}
          currency={currency}
          campaign={editingCampaign}
          onClose={() => {
            setFormOpen(false);
            setEditingCampaign(null);
          }}
          onSaved={(nextMessage) => {
            setMessage(nextMessage);
            void loadPage(1, applied, true);
          }}
        />
      ) : null}

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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Summary
          label="Filtrelenen kampanya"
          value={formatNumber(stats.count)}
        />
        <Summary label="Aktif" value={formatNumber(stats.activeCount)} />
        <Summary
          label="Toplam harcama"
          value={formatMoney(stats.spend, currency)}
        />
        <Summary label="Toplam tıklama" value={formatNumber(stats.clicks)} />
        <Summary
          label="Ortalama CTR"
          value={
            stats.avgCtr === null
              ? "—"
              : formatPercent(stats.avgCtr.toFixed(2))
          }
        />
      </section>

      <form
        onSubmit={applyFilters}
        className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Detaylı filtre</h2>
            <p className="mt-1 text-sm text-slate-500">
              İstatistikler seçilen filtreye göre yeniden hesaplanır
            </p>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
              Temizle
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Arama
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-line py-2.5 pr-3 pl-9 outline-none ring-accent/30 focus:ring-4"
                placeholder="Kampanya adı veya ID"
              />
            </div>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Durum
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
            >
              <option value="">Tümü</option>
              {facets.statuses.map((status) => (
                <option key={status} value={status}>
                  {campaignStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Hedef
            <select
              value={filters.objective}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  objective: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
            >
              <option value="">Tümü</option>
              {facets.objectives.map((objective) => (
                <option key={objective} value={objective}>
                  {campaignObjectiveLabel(objective)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Min. harcama
            <input
              type="number"
              min="0"
              step="0.01"
              value={filters.minSpend}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  minSpend: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Maks. harcama
            <input
              type="number"
              min="0"
              step="0.01"
              value={filters.maxSpend}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxSpend: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Min. tıklama
            <input
              type="number"
              min="0"
              value={filters.minClicks}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  minClicks: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sıralama
            <select
              value={filters.sort}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sort: event.target.value as CampaignSort,
                }))
              }
              className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
            >
              <option value="spend">Harcama (çoktan aza)</option>
              <option value="clicks">Tıklama (çoktan aza)</option>
              <option value="ctr">CTR (yüksekten düşüğe)</option>
              <option value="name">İsim (A-Z)</option>
              <option value="status">Durum</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filters.onlyWithSpend}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  onlyWithSpend: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-line"
            />
            Sadece harcama olanlar
          </label>
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Filtreyi uygula
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-line bg-card shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-semibold">Kampanyalar</h2>
          <p className="mt-1 text-sm text-slate-500">
            {formatNumber(items.length)} / {formatNumber(stats.count)} kayıt
            yüklendi
          </p>
        </div>
        {items.length === 0 && !loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            Bu filtreye uyan kampanya yok.
          </div>
        ) : (
          <div
            ref={scrollRootRef}
            className="max-h-[min(68vh,760px)] overflow-auto"
          >
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Kampanya</th>
                  {showAccountColumn ? (
                    <th className="px-6 py-3 font-medium">Hesap</th>
                  ) : null}
                  <th className="px-6 py-3 font-medium">Hedef</th>
                  <th className="px-6 py-3 font-medium">Durum</th>
                  <th className="px-6 py-3 font-medium">Bütçe</th>
                  <th className="px-6 py-3 font-medium">Harcama</th>
                  <th className="px-6 py-3 font-medium">Tıklama</th>
                  <th className="px-6 py-3 font-medium">CTR</th>
                  <th className="px-6 py-3 font-medium">Güncelleme</th>
                  {canManage ? (
                    <th className="px-6 py-3 font-medium">İşlem</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-line">
                    <td className="px-6 py-3">
                      <Link
                        href={`/accounts/${campaign.accountId}/campaigns/${campaign.id}?${dateRangeSearchParams(
                          {
                            preset: applied.datePreset,
                            since: applied.since,
                            until: applied.until,
                          },
                        )}`}
                        className="block hover:text-accent"
                      >
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-xs text-slate-400">
                          {campaign.metaCampaignId}
                        </p>
                      </Link>
                    </td>
                    {showAccountColumn ? (
                      <td className="px-6 py-3 text-slate-600">
                        {campaign.accountName}
                      </td>
                    ) : null}
                    <td className="px-6 py-3 text-slate-600">
                      {campaignObjectiveLabel(campaign.objective)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge
                        tone={campaignStatusTone(campaign.effectiveStatus)}
                      >
                        {campaignStatusLabel(campaign.effectiveStatus)}
                      </StatusBadge>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {campaign.dailyBudget
                        ? `${formatMoney(campaign.dailyBudget, campaign.currency, true)} / gün`
                        : campaign.lifetimeBudget
                          ? `${formatMoney(campaign.lifetimeBudget, campaign.currency, true)} toplam`
                          : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatMoney(campaign.spend, campaign.currency)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatNumber(campaign.clicks)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatPercent(campaign.ctr)}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {formatDateTime(campaign.lastSyncedAt)}
                    </td>
                    {canManage ? (
                      <td className="px-6 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCampaign(campaign);
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
                ))}
              </tbody>
            </table>
            <div ref={sentinelRef} className="px-6 py-4 text-center text-sm text-slate-400">
              {loading
                ? "Yükleniyor..."
                : hasMore
                  ? "Kaydırarak daha fazla yükle"
                  : items.length > 0
                    ? "Tüm sonuçlar yüklendi"
                    : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
