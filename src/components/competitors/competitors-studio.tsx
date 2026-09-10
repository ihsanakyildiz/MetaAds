"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Radar, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  competitorKindLabel,
  type CompetitorInsight,
  type CompetitorKind,
  type CompetitorWatchView,
} from "@/lib/competitors-types";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  DEFAULT_SEARCH_ENGINES,
  SEARCH_ENGINE_IDS,
  searchEngineLabel,
  type SearchEngineId,
} from "@/lib/search-engines-types";

type ProductHint = {
  name: string;
  productId: string;
  purchases: number;
};

export function CompetitorsStudio({
  canManage,
  canScanAds,
}: {
  canManage: boolean;
  canScanAds: boolean;
}) {
  const [items, setItems] = useState<CompetitorWatchView[]>([]);
  const [products, setProducts] = useState<ProductHint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<CompetitorKind>("PRODUCT");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [website, setWebsite] = useState("");
  const [searchTemplate, setSearchTemplate] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editSearchTemplate, setEditSearchTemplate] = useState("");
  const [searchEngines, setSearchEngines] = useState<SearchEngineId[]>(
    DEFAULT_SEARCH_ENGINES,
  );
  const [editSearchEngines, setEditSearchEngines] = useState<SearchEngineId[]>(
    DEFAULT_SEARCH_ENGINES,
  );
  const [pageId, setPageId] = useState("");
  const [country, setCountry] = useState("TR");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState("");
  const [adsRunningId, setAdsRunningId] = useState("");
  const [error, setError] = useState("");

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/competitors", { credentials: "include" });
    const payload = (await response.json().catch(() => null)) as {
      items?: CompetitorWatchView[];
      products?: ProductHint[];
      error?: string;
    } | null;
    setLoading(false);

    if (!response.ok || !payload) {
      setError(payload?.error ?? "Liste yüklenemedi.");
      return;
    }

    setItems(payload.items ?? []);
    setProducts(payload.products ?? []);
    setSelectedId((current) => current ?? payload.items?.[0]?.id ?? null);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setEditWebsite(selected?.website ?? "");
    setEditSearchTemplate(selected?.searchTemplate ?? "");
    setEditSearchEngines(selected?.searchEngines ?? DEFAULT_SEARCH_ENGINES);
  }, [
    selected?.id,
    selected?.website,
    selected?.searchTemplate,
    selected?.searchEngines,
  ]);

  async function createWatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/competitors", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        name,
        query: query || name,
        website,
        searchTemplate,
        searchEngines,
        pageId,
        country,
        notes,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (CompetitorWatchView & { error?: string })
      | null;
    setSaving(false);

    if (!response.ok || !payload || payload.error) {
      setError(payload?.error ?? "Kayıt eklenemedi.");
      return;
    }

    setName("");
    setQuery("");
    setWebsite("");
    setSearchTemplate("");
    setSearchEngines(DEFAULT_SEARCH_ENGINES);
    setPageId("");
    setNotes("");
    setItems((current) => [payload, ...current]);
    setSelectedId(payload.id);
  }

  async function saveSearchSettings() {
    if (!selected) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/competitors/${selected.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website: editWebsite,
        searchTemplate: editSearchTemplate,
        searchEngines: editSearchEngines,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (CompetitorWatchView & { error?: string })
      | null;
    setSaving(false);

    if (!response.ok || !payload || payload.error) {
      setError(payload?.error ?? "Arama adresi kaydedilemedi.");
      return;
    }

    setItems((current) =>
      current.map((item) => (item.id === payload.id ? payload : item)),
    );
  }

  async function removeWatch(id: string) {
    const response = await fetch(`/api/competitors/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      setError("Silinemedi.");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  async function analyzeAds(id: string) {
    setAdsRunningId(id);
    setError("");

    const response = await fetch(`/api/competitors/${id}/ads`, {
      method: "POST",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as
      | (CompetitorInsight & { error?: string })
      | null;
    setAdsRunningId("");

    if (!response.ok || !payload || payload.error) {
      setError(payload?.error ?? "Meta reklam taraması başarısız.");
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, lastReport: payload } : item,
      ),
    );
  }

  async function analyze(id: string) {
    setRunningId(id);
    setError("");

    const response = await fetch(`/api/competitors/${id}/analyze`, {
      method: "POST",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as
      | (CompetitorInsight & { error?: string })
      | null;
    setRunningId("");

    if (!response.ok || !payload || payload.error) {
      setError(payload?.error ?? "Tarama başarısız.");
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, lastReport: payload } : item,
      ),
    );
  }

  const report = selected?.lastReport ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-indigo-200 bg-indigo-50/70 p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
          <Radar className="h-3.5 w-3.5" />
          Canlı pazar taraması
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          Rakip fiyatı ve Meta reklamı — kamuya açık kaynaklardan
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Meta reklamları resmi{" "}
          <a
            href="https://www.facebook.com/ads/library/api/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            ads_archive
          </a>{" "}
          API’sinden okunur; yapay zeka yalnızca bu kayıtları özetler. En doğru
          sonuç Facebook Sayfa ID ile gelir. Ticari reklam arşivi AB/İngiltere
          teslimatındadır; bağlanan Meta kullanıcısının{" "}
          <a
            href="https://www.facebook.com/ID"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            facebook.com/ID
          </a>{" "}
          kimlik doğrulaması gerekir. Fiyat taraması ayrıdır ve tahmine açıktır.
        </p>
      </section>

      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          {canManage ? (
            <form
              onSubmit={createWatch}
              className="rounded-2xl border border-line bg-card p-5 shadow-[0_10px_30px_rgba(16,32,51,0.04)]"
            >
              <h3 className="font-semibold">Takip ekle</h3>
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Tür</span>
                  <select
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as CompetitorKind)
                    }
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  >
                    <option value="PRODUCT">Sattığım / izlediğim ürün</option>
                    <option value="COMPANY">Rakip firma</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Ad</span>
                  <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Rakip mağaza veya ürün adı"
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Arama ifadesi</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Boşsa ad kullanılır"
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  />
                </label>
                <EngineChecks
                  value={searchEngines}
                  onChange={setSearchEngines}
                />
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">
                    Rakip mağaza (isteğe bağlı)
                  </span>
                  <input
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder="https://magaza.ornek"
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  />
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Yalnızca tek bir satıcı sitesi. Arama motoru adresi yazmayın.
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">
                    Site arama adresi
                  </span>
                  <input
                    value={searchTemplate}
                    onChange={(event) => setSearchTemplate(event.target.value)}
                    placeholder="https://magaza.ornek/arama?q="
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  />
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Sitede arama yapıp adres çubuğundaki linki yapıştırın. Arama
                    kelimesini silmeniz yeterli; sistem “Arama ifadesi”ni o
                    parametreye ekler.
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">
                    Facebook Sayfa ID (isteğe bağlı)
                  </span>
                  <input
                    value={pageId}
                    onChange={(event) => setPageId(event.target.value)}
                    placeholder="Sayfa ID — en doğru reklam taraması"
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  />
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Rakip Facebook sayfasının sayısal ID’si. Kelime aramasından
                    daha isabetlidir.
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Ülke</span>
                  <input
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Not</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? "Ekleniyor..." : "Takibe al"}
                </button>
              </div>
              {products.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Kendi satan ürünlerin
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {products.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        onClick={() => {
                          setKind("PRODUCT");
                          setName(product.name);
                          setQuery(product.name);
                        }}
                        className="rounded-full border border-line px-3 py-1 text-xs hover:border-accent/50"
                      >
                        {product.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </form>
          ) : null}

          <div className="rounded-2xl border border-line bg-card p-5">
            <h3 className="font-semibold">İzlenenler</h3>
            {loading ? (
              <p className="mt-3 text-sm text-slate-500">Yükleniyor…</p>
            ) : items.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Henüz rakip veya ürün eklenmedi.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left ${
                        selected?.id === item.id
                          ? "border-accent/50 bg-indigo-50/70"
                          : "border-line hover:border-accent/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge tone="neutral">
                          {competitorKindLabel(item.kind)}
                        </StatusBadge>
                        {canManage ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeWatch(item.id);
                            }}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-medium">{item.name}</p>
                      <p className="truncate text-xs text-slate-500">{item.query}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selected ? (
            <section className="rounded-2xl border border-line bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {selected.country} · {selected.query}
                    {selected.website ? ` · ${selected.website}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canScanAds ? (
                    <button
                      type="button"
                      disabled={Boolean(adsRunningId)}
                      onClick={() => void analyzeAds(selected.id)}
                      className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-60"
                    >
                      {adsRunningId === selected.id
                        ? "Kütüphane okunuyor..."
                        : "Meta reklam taraması"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={Boolean(runningId)}
                    onClick={() => void analyze(selected.id)}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {runningId === selected.id
                      ? "İnternette taranıyor..."
                      : report
                        ? "Fiyatı yenile"
                        : "Pazar taraması başlat"}
                  </button>
                </div>
              </div>

              {canManage ? (
                <div className="mt-5 space-y-3 rounded-xl border border-dashed border-line p-4">
                  <EngineChecks
                    value={editSearchEngines}
                    onChange={setEditSearchEngines}
                  />
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium">
                        Rakip mağaza
                      </span>
                      <input
                        value={editWebsite}
                        onChange={(event) => setEditWebsite(event.target.value)}
                        placeholder="https://magaza.ornek"
                        className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium">
                        Mağaza arama adresi
                      </span>
                      <input
                        value={editSearchTemplate}
                        onChange={(event) =>
                          setEditSearchTemplate(event.target.value)
                        }
                        placeholder="https://magaza.ornek/arama?q="
                        className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveSearchSettings()}
                        className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:border-accent/40 disabled:opacity-60"
                      >
                        {saving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : selected.searchTemplate ? (
                <p className="mt-3 text-xs text-slate-500">
                  Arama adresi: {selected.searchTemplate}
                </p>
              ) : null}

              {report ? (
                <div className="mt-6 space-y-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Özet
                    </p>
                    <h4 className="mt-1 text-xl font-semibold">{report.headline}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {report.summary}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatDateTime(report.generatedAt)} · {report.model}
                    </p>
                    {report.libraryNote ? (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {report.libraryNote}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <PriceCard
                      label="En düşük"
                      value={report.priceRange.min}
                      currency={report.priceRange.currency}
                    />
                    <PriceCard
                      label="Tipik"
                      value={report.priceRange.typical}
                      currency={report.priceRange.currency}
                    />
                    <PriceCard
                      label="En yüksek"
                      value={report.priceRange.max}
                      currency={report.priceRange.currency}
                    />
                  </div>

                  {report.prices.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Görülen fiyatlar
                      </p>
                      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                        {report.prices.map((price) => (
                          <li
                            key={`${price.seller}-${price.product}-${price.url}`}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{price.seller}</p>
                                {price.verified ? (
                                  <StatusBadge tone="success">Siteden doğrulandı</StatusBadge>
                                ) : null}
                                {price.engine ? (
                                  <StatusBadge tone="neutral">{price.engine}</StatusBadge>
                                ) : null}
                              </div>
                              <p className="text-xs text-slate-500">
                                {price.product} {price.note ? `· ${price.note}` : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                {price.price === null
                                  ? "—"
                                  : formatMoney(price.price, price.currency)}
                              </p>
                              {price.url ? (
                                <a
                                  href={price.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-accent"
                                >
                                  Kaynak
                                </a>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {report.ads.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Resmi Meta Reklam Kütüphanesi
                      </p>
                      <ul className="mt-2 space-y-2">
                        {report.ads.map((ad) => (
                          <li
                            key={ad.id || `${ad.advertiser}-${ad.message}`}
                            className="rounded-xl border border-line px-4 py-3"
                          >
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge tone="accent">{ad.platform}</StatusBadge>
                              {ad.active ? (
                                <StatusBadge tone="success">Aktif</StatusBadge>
                              ) : (
                                <StatusBadge tone="neutral">Durmuş</StatusBadge>
                              )}
                              {ad.coverage ? (
                                <StatusBadge tone="neutral">{ad.coverage}</StatusBadge>
                              ) : null}
                            </div>
                            <p className="mt-1 font-medium">{ad.advertiser}</p>
                            <p className="mt-1 text-sm text-slate-600">{ad.message}</p>
                            {ad.offer ? (
                              <p className="mt-1 text-xs text-slate-500">{ad.offer}</p>
                            ) : null}
                            {ad.platforms?.length ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {ad.platforms.join(", ")}
                                {ad.languages?.length
                                  ? ` · ${ad.languages.join(", ")}`
                                  : ""}
                                {ad.euReach
                                  ? ` · AB erişim ~${ad.euReach}`
                                  : ""}
                              </p>
                            ) : null}
                            {ad.url ? (
                              <a
                                href={ad.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block text-xs text-accent"
                              >
                                Kütüphane görüntüsü
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : report.libraryNote ? (
                    <p className="text-sm text-slate-500">{report.libraryNote}</p>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <ListCard title="Riskler" items={report.threats} />
                    <ListCard title="Fırsatlar" items={report.opportunities} />
                  </div>

                  {report.sources.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Kaynaklar
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {report.sources.map((source) => (
                          <li key={source.url}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent hover:text-accent-strong"
                            >
                              {source.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-6 text-sm text-slate-500">
                  Henüz tarama yok. “Pazar taraması başlat” ile güncel fiyat ve
                  reklamları çek.
                </p>
              )}
            </section>
          ) : (
            <p className="rounded-2xl border border-line bg-card p-6 text-sm text-slate-500">
              Soldan bir ürün veya rakip ekleyin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EngineChecks({
  value,
  onChange,
}: {
  value: SearchEngineId[];
  onChange: (next: SearchEngineId[]) => void;
}) {
  return (
    <fieldset className="block text-sm">
      <legend className="mb-1.5 font-medium">Arama motorları</legend>
      <div className="flex flex-wrap gap-2">
        {SEARCH_ENGINE_IDS.map((id) => {
          const checked = value.includes(id);
          return (
            <label
              key={id}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${
                checked
                  ? "border-accent/50 bg-indigo-50 text-slate-900"
                  : "border-line text-slate-600"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => {
                  if (checked && value.length === 1) {
                    return;
                  }
                  onChange(
                    checked
                      ? value.filter((item) => item !== id)
                      : [...value, id],
                  );
                }}
              />
              {searchEngineLabel(id)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PriceCard({
  label,
  value,
  currency,
}: {
  label: string;
  value: number | null;
  currency: string | null;
}) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">
        {value === null ? "—" : formatMoney(value, currency)}
      </p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
