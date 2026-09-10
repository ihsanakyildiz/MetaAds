import { completeWebResearch } from "@/lib/ai";
import type { CompetitorPrice } from "@/lib/competitors-types";
import {
  isSearchEngineHost,
  searchEngineLabel,
  type SearchEngineId,
} from "@/lib/search-engines-types";

function encodeQuery(query: string) {
  return encodeURIComponent(query.trim());
}

export function engineSearchQuery(id: SearchEngineId, query: string) {
  const term = query.trim();

  switch (id) {
    case "google":
      return `${term} fiyat`;
    case "google_shopping":
      return `${term} alışveriş`;
    case "bing":
      return `${term} fiyat`;
    case "yandex":
      return `${term} fiyat`;
    case "duckduckgo":
      return `${term} fiyat`;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function engineSearchUrl(
  id: SearchEngineId,
  query: string,
  country: string,
) {
  const encoded = encodeQuery(engineSearchQuery(id, query));
  const gl = country.trim().toLowerCase() || "tr";

  switch (id) {
    case "google":
      return `https://www.google.com/search?q=${encoded}&hl=${gl}&gl=${gl}`;
    case "google_shopping":
      return `https://www.google.com/search?tbm=shop&q=${encodeQuery(query)}&hl=${gl}&gl=${gl}`;
    case "bing":
      return `https://www.bing.com/search?q=${encoded}`;
    case "yandex":
      return `https://yandex.com.tr/search/?text=${encoded}`;
    case "duckduckgo":
      return `https://duckduckgo.com/?q=${encoded}`;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

const MARKET_PROMPT = `Sen pazar araştırmacısısın. Türkçe yaz.
web_search ile verilen her arama motoru sorgusunu çalıştır.
Arama motorunun kendisi satıcı değildir. Satıcı, ürünü satan mağaza / pazaryeri sitesidir.
Her gerçek satıcı için gördüğün satış fiyatını yaz. Görmediğin fiyatı uydurma.
Aynı mağazayı bir kez yaz. Yanıt yalnızca JSON:
{
  "prices":[{"seller":"","product":"","price":0,"currency":"TRY","url":"","engine":"google","note":""}],
  "note":""
}`;

function asMarketPrices(value: unknown): CompetitorPrice[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const rows = (value as { prices?: unknown }).prices;
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    const seller = typeof row.seller === "string" ? row.seller.trim() : "";
    const price = Number(row.price);

    if (!seller || !url || !/^https?:\/\//i.test(url) || isSearchEngineHost(url)) {
      return [];
    }

    if (!Number.isFinite(price) || price < 10 || price > 2_000_000) {
      return [];
    }

    const engine =
      typeof row.engine === "string" && row.engine.trim()
        ? row.engine.trim()
        : "";

    return [
      {
        seller,
        product: typeof row.product === "string" ? row.product.trim() : "",
        price: Math.round(price * 100) / 100,
        currency:
          typeof row.currency === "string" && row.currency.trim()
            ? row.currency.trim()
            : "TRY",
        url,
        note:
          typeof row.note === "string" && row.note.trim()
            ? row.note.trim()
            : engine
              ? `${engine} aramasında görüldü`
              : "Arama motoru taramasında görüldü",
        engine: engine || null,
        verified: false,
      } satisfies CompetitorPrice,
    ];
  });
}

export async function collectMarketPrices(input: {
  query: string;
  country: string;
  engines: SearchEngineId[];
}): Promise<{ prices: CompetitorPrice[]; note: string }> {
  if (input.engines.length === 0) {
    return { prices: [], note: "Arama motoru seçilmedi." };
  }

  const lines = input.engines.map((id) => {
    const label = searchEngineLabel(id);
    const q = engineSearchQuery(id, input.query);
    return `${label}: ${q}`;
  });

  try {
    const result = await completeWebResearch(
      MARKET_PROMPT,
      [
        `Ülke: ${input.country}`,
        `Ürün: ${input.query}`,
        "Arama motoru sorguları:",
        ...lines,
        "Her motorda ürünün hangi sitede kaça satıldığını bul.",
      ].join("\n"),
      input.country,
      ["web_search"],
    );

    const prices = asMarketPrices(result.data).slice(0, 16);
    const modelNote =
      result.data && typeof result.data.note === "string"
        ? result.data.note.trim()
        : "";

    return {
      prices,
      note: prices.length
        ? `${prices.length} satıcı fiyatı arama motorlarından bulundu.${modelNote ? ` ${modelNote}` : ""}`
        : modelNote ||
          "Arama motorlarında bu ürüne ait net satıcı fiyatı bulunamadı.",
    };
  } catch (error) {
    return {
      prices: [],
      note:
        error instanceof Error
          ? error.message
          : "Arama motoru taraması başarısız.",
    };
  }
}
