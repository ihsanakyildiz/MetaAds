import { getDecryptedAccessToken, getDecryptedMetaConfig } from "@/lib/meta";

export type AdLibraryHit = {
  id: string;
  pageName: string;
  pageId: string | null;
  body: string;
  platforms: string[];
  snapshotUrl: string | null;
  startTime: string | null;
  stopTime: string | null;
  coverage: string;
};

type ArchiveRow = {
  id?: string;
  page_name?: string;
  page_id?: string;
  ad_creative_bodies?: string[];
  publisher_platforms?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
};

function asHits(rows: ArchiveRow[], coverage: string): AdLibraryHit[] {
  return rows
    .map((row) => ({
      id: row.id ?? "",
      pageName: row.page_name ?? "Bilinmeyen sayfa",
      pageId: row.page_id ?? null,
      body: (row.ad_creative_bodies ?? []).filter(Boolean).join(" · "),
      platforms: row.publisher_platforms ?? [],
      snapshotUrl: row.ad_snapshot_url ?? null,
      startTime: row.ad_delivery_start_time ?? null,
      stopTime: row.ad_delivery_stop_time ?? null,
      coverage,
    }))
    .filter((row) => row.id);
}

export async function searchAdLibrary(input: {
  query: string;
  country: string;
  pageId?: string | null;
}): Promise<{ hits: AdLibraryHit[]; note: string }> {
  const tokenData = await getDecryptedAccessToken();
  const config = await getDecryptedMetaConfig();

  if (!tokenData?.accessToken) {
    return {
      hits: [],
      note: "Meta bağlı değil. Reklam Kütüphanesi API’si atlandı; web taraması kullanıldı.",
    };
  }

  const version = config?.graphVersion || process.env.META_GRAPH_VERSION || "v22.0";
  const countries = [input.country.toUpperCase() || "TR"];
  if (!countries.includes("GB") && input.country.toUpperCase() === "TR") {
    countries.push("GB");
  }

  const hits: AdLibraryHit[] = [];
  const errors: string[] = [];

  for (const country of countries) {
    const params = new URLSearchParams({
      access_token: tokenData.accessToken,
      ad_reached_countries: JSON.stringify([country]),
      ad_type: "ALL",
      ad_active_status: "ACTIVE",
      search_type: "KEYWORD_UNORDERED",
      fields:
        "id,page_name,page_id,ad_creative_bodies,publisher_platforms,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time",
      limit: "12",
    });

    if (input.pageId?.trim()) {
      params.set("search_page_ids", input.pageId.trim());
    } else {
      params.set("search_terms", input.query.slice(0, 100));
    }

    const response = await fetch(
      `https://graph.facebook.com/${version}/ads_archive?${params.toString()}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: ArchiveRow[];
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      errors.push(payload?.error?.message ?? `${country} kütüphane hatası`);
      continue;
    }

    const coverage =
      country === "GB"
        ? "AB/İngiltere ticari kapsamı"
        : `${country} teslimat araması`;
    hits.push(...asHits(payload?.data ?? [], coverage));
  }

  const unique = new Map(hits.map((hit) => [hit.id, hit]));
  const note = unique.size
    ? "Meta Reklam Kütüphanesi resmi API. Ticari reklamlar esas olarak AB/İngiltere teslimatında görünür; TR sonuçları sınırlı olabilir."
    : errors[0] ||
      "Kütüphanede aktif reklam bulunamadı. Model Facebook / Instagram / Ad Library web sonuçlarını taradı.";

  return { hits: [...unique.values()].slice(0, 16), note };
}
