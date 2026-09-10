import { getDecryptedAccessToken, getDecryptedMetaConfig } from "@/lib/meta";

export type AdLibraryHit = {
  id: string;
  pageName: string;
  pageId: string | null;
  body: string;
  titles: string[];
  descriptions: string[];
  captions: string[];
  platforms: string[];
  languages: string[];
  snapshotUrl: string | null;
  startTime: string | null;
  stopTime: string | null;
  euReach: number | null;
  coverage: string;
};

export type AdLibraryStatus = {
  ready: boolean;
  connected: boolean;
  code: number | null;
  note: string;
};

type ArchiveRow = {
  id?: string;
  page_name?: string;
  page_id?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  publisher_platforms?: string[];
  languages?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  eu_total_reach?: number;
};

type GraphError = {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
};

const ARCHIVE_FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_creative_link_captions",
  "publisher_platforms",
  "languages",
  "ad_snapshot_url",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "eu_total_reach",
].join(",");

const COMMERCIAL_COUNTRIES = ["GB", "DE", "FR", "NL", "IE", "AT", "BE"];

function asList(value?: string[]) {
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

function asHits(rows: ArchiveRow[], coverage: string): AdLibraryHit[] {
  return rows
    .map((row) => ({
      id: row.id ?? "",
      pageName: row.page_name ?? "Bilinmeyen sayfa",
      pageId: row.page_id ?? null,
      body: asList(row.ad_creative_bodies).join(" · "),
      titles: asList(row.ad_creative_link_titles),
      descriptions: asList(row.ad_creative_link_descriptions),
      captions: asList(row.ad_creative_link_captions),
      platforms: asList(row.publisher_platforms),
      languages: asList(row.languages),
      snapshotUrl: row.ad_snapshot_url ?? null,
      startTime: row.ad_delivery_start_time ?? null,
      stopTime: row.ad_delivery_stop_time ?? null,
      euReach: typeof row.eu_total_reach === "number" ? row.eu_total_reach : null,
      coverage,
    }))
    .filter((row) => row.id);
}

function libraryErrorNote(error?: GraphError | null) {
  const code = error?.code;
  const sub = error?.error_subcode;
  const message = error?.error_user_msg || error?.message || "";

  if (code === 10 || sub === 2332002 || /facebook\.com\/ID/i.test(message)) {
    return "Reklam Kütüphanesi için Meta kimlik doğrulaması gerekir. Bağlı kullanıcının facebook.com/ID üzerinden kimliğini onaylaması şarttır. App Review veya ads_read yetkisi yetmez.";
  }

  if (code === 190) {
    return "Meta oturumu geçersiz. Ayarlar’dan köprüyü yeniden bağlayın.";
  }

  if (code === 613) {
    return "Reklam Kütüphanesi istek limiti aşıldı. Bir süre sonra tekrar deneyin.";
  }

  return message || "Reklam Kütüphanesi isteği reddedildi.";
}

async function graphVersion() {
  const config = await getDecryptedMetaConfig();
  return config?.graphVersion || process.env.META_GRAPH_VERSION || "v22.0";
}

async function queryArchive(input: {
  token: string;
  version: string;
  countries: string[];
  terms?: string;
  pageId?: string | null;
  languages?: string[];
  coverage: string;
}): Promise<{ hits: AdLibraryHit[]; error?: GraphError }> {
  const params = new URLSearchParams({
    access_token: input.token,
    ad_reached_countries: JSON.stringify(input.countries),
    ad_type: "ALL",
    ad_active_status: "ALL",
    search_type: "KEYWORD_UNORDERED",
    fields: ARCHIVE_FIELDS,
    limit: "25",
  });

  if (input.pageId?.trim()) {
    params.set("search_page_ids", input.pageId.trim());
  } else if (input.terms?.trim()) {
    params.set("search_terms", input.terms.trim().slice(0, 100));
  } else {
    return { hits: [] };
  }

  if (input.languages?.length) {
    params.set("languages", JSON.stringify(input.languages));
  }

  const response = await fetch(
    `https://graph.facebook.com/${input.version}/ads_archive?${params.toString()}`,
    { cache: "no-store" },
  );
  const payload = (await response.json().catch(() => null)) as {
    data?: ArchiveRow[];
    error?: GraphError;
  } | null;

  if (!response.ok) {
    return { hits: [], error: payload?.error };
  }

  return { hits: asHits(payload?.data ?? [], input.coverage) };
}

export async function probeAdLibrary(): Promise<AdLibraryStatus> {
  const tokenData = await getDecryptedAccessToken();

  if (!tokenData?.accessToken) {
    return {
      ready: false,
      connected: false,
      code: null,
      note: "Meta bağlı değil. Reklam Kütüphanesi API’si kullanıcı erişim jetonu ister.",
    };
  }

  const version = await graphVersion();
  const result = await queryArchive({
    token: tokenData.accessToken,
    version,
    countries: ["GB"],
    terms: "test",
    coverage: "durum",
  });

  if (result.error) {
    return {
      ready: false,
      connected: true,
      code: result.error.code ?? null,
      note: libraryErrorNote(result.error),
    };
  }

  return {
    ready: true,
    connected: true,
    code: null,
    note: "Reklam Kütüphanesi API’si bu jetonla yanıt veriyor. Ticari reklamlar yalnızca AB/İngiltere teslimatında arşivlenir.",
  };
}

export async function searchAdLibrary(input: {
  query: string;
  country: string;
  pageId?: string | null;
}): Promise<{ hits: AdLibraryHit[]; note: string; ready: boolean }> {
  const tokenData = await getDecryptedAccessToken();

  if (!tokenData?.accessToken) {
    return {
      hits: [],
      ready: false,
      note: "Meta bağlı değil. Resmi ads_archive çağrısı yapılamadı.",
    };
  }

  const version = await graphVersion();
  const country = (input.country || "TR").trim().toUpperCase();
  const pageId = input.pageId?.trim() || null;
  const terms = input.query.trim();
  const commercial = COMMERCIAL_COUNTRIES.includes(country)
    ? [country]
    : [...COMMERCIAL_COUNTRIES];

  const queries = [
    queryArchive({
      token: tokenData.accessToken,
      version,
      countries: commercial,
      pageId,
      terms: pageId ? undefined : terms,
      languages: country === "TR" ? ["tr"] : undefined,
      coverage: "AB/İngiltere ticari arşiv",
    }),
    queryArchive({
      token: tokenData.accessToken,
      version,
      countries: [country],
      pageId,
      terms: pageId ? undefined : terms,
      coverage: `${country} teslimat (ticari reklam yoksa yalnızca siyasi/sosyal)`,
    }),
  ];

  const results = await Promise.all(queries);
  const authError = results.find((item) => item.error)?.error;
  const hits = [...new Map(results.flatMap((item) => item.hits).map((hit) => [hit.id, hit])).values()];

  if (authError && hits.length === 0) {
    return { hits: [], ready: false, note: libraryErrorNote(authError) };
  }

  if (hits.length === 0) {
    return {
      hits: [],
      ready: true,
      note: pageId
        ? "Sayfa ID ile ads_archive boş döndü. Bu sayfanın AB/İngiltere’ye teslim edilmiş arşiv kaydı olmayabilir."
        : "Kelime araması ads_archive’ta sonuç vermedi. En doğru tarama Facebook Sayfa ID ile yapılır. TR’ye özel ticari reklamlar bu API’de yoktur.",
    };
  }

  return {
    hits: hits.slice(0, 24),
    ready: true,
    note: "Kayıtlar resmi Meta ads_archive yanıtıdır. Yapay zeka yalnızca bu satırları özetler; dışarıdan reklam eklemez.",
  };
}
