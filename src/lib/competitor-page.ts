export type PagePrice = {
  amount: number;
  currency: string;
  product: string;
  url: string;
  context: string;
  verified: true;
};

export type SiteEvidence = {
  pages: Array<{ url: string; title: string; status: number }>;
  prices: PagePrice[];
  note: string;
};

function normalizeWebsite(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function queryTokens(query: string) {
  return query
    .toLocaleLowerCase("tr-TR")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function skuTokens(tokens: string[]) {
  const withDigit = tokens.filter((token) => /\d/.test(token));
  return withDigit.length > 0 ? withDigit : tokens.slice(0, 3);
}

function scoreText(text: string, tokens: string[]) {
  const haystack = text.toLocaleLowerCase("tr-TR");
  return tokens.reduce(
    (sum, token) => sum + (haystack.includes(token) ? 1 : 0),
    0,
  );
}

function parsePrice(raw: string) {
  const cleaned = raw.replace(/[^\d,.\-]/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    normalized =
      decimals === 2 || decimals === 1
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 10 || amount > 2_000_000) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function decode(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decode(match?.[1] ?? "").slice(0, 180);
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MetaAdsPriceBot/1.0; +https://metaads.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    const html = await response.text();
    return { url: response.url || url, status: response.status, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonLdPrices(html: string, pageUrl: string): PagePrice[] {
  const blocks = [...html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )];
  const found: PagePrice[] = [];

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1] ?? "") as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        collectOffers(node, pageUrl, found);
      }
    } catch {
      // ignore broken JSON-LD
    }
  }

  return found;
}

function collectOffers(node: unknown, pageUrl: string, into: PagePrice[]) {
  if (!node || typeof node !== "object") {
    return;
  }

  const row = node as Record<string, unknown>;
  const type = String(row["@type"] ?? "");
  const graph = row["@graph"];

  if (Array.isArray(graph)) {
    for (const item of graph) {
      collectOffers(item, pageUrl, into);
    }
  }

  const name = typeof row.name === "string" ? row.name : "";
  const offers = row.offers;
  const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];

  for (const offer of offerList) {
    if (!offer || typeof offer !== "object") {
      continue;
    }

    const data = offer as Record<string, unknown>;
    const amount = parsePrice(String(data.price ?? data.lowPrice ?? ""));
    if (amount === null) {
      continue;
    }

    into.push({
      amount,
      currency: String(data.priceCurrency ?? "TRY"),
      product: name,
      url: typeof data.url === "string" ? data.url : pageUrl,
      context: "json-ld",
      verified: true,
    });
  }

  if (type.toLowerCase().includes("product") && typeof row.price === "string") {
    const amount = parsePrice(row.price);
    if (amount !== null) {
      into.push({
        amount,
        currency: "TRY",
        product: name,
        url: pageUrl,
        context: "json-ld-price",
        verified: true,
      });
    }
  }
}

function extractMetaPrice(html: string, pageUrl: string, title: string): PagePrice[] {
  const amountMatch =
    html.match(/product:price:amount[^>]+content=["']([^"']+)/i) ||
    html.match(/content=["']([^"']+)["'][^>]+product:price:amount/i) ||
    html.match(/"price"\s*:\s*"?(\d+[.,]\d{2})"?/i);
  const currencyMatch =
    html.match(/product:price:currency[^>]+content=["']([^"']+)/i) ||
    html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/i);

  if (!amountMatch?.[1]) {
    return [];
  }

  const amount = parsePrice(amountMatch[1]);
  if (amount === null) {
    return [];
  }

  return [
    {
      amount,
      currency: currencyMatch?.[1] ?? "TRY",
      product: title,
      url: pageUrl,
      context: "meta",
      verified: true,
    },
  ];
}

function findProductLinks(html: string, base: URL, tokens: string[]) {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const scored: Array<{ url: string; score: number }> = [];

  for (const href of hrefs) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
      continue;
    }

    let next: URL;
    try {
      next = new URL(href, base);
    } catch {
      continue;
    }

    if (next.origin !== base.origin) {
      continue;
    }

    const path = `${next.pathname} ${next.search}`.toLocaleLowerCase("tr-TR");
    if (!/(urun|product|item|p\/)/i.test(path) && !tokens.some((token) => path.includes(token))) {
      continue;
    }

    const score = scoreText(decodeURIComponent(next.pathname), tokens);
    if (score <= 0) {
      continue;
    }

    scored.push({ url: next.toString(), score });
  }

  return [...new Map(scored.map((item) => [item.url, item])).values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((item) => item.url);
}

function searchUrls(base: URL, query: string) {
  const encoded = encodeURIComponent(query);
  return [
    `${base.origin}/?s=${encoded}&post_type=product`,
    `${base.origin}/?s=${encoded}`,
    `${base.origin}/search?q=${encoded}`,
    `${base.origin}/arama?q=${encoded}`,
  ];
}

function pickBest(prices: PagePrice[], query: string) {
  const tokens = skuTokens(queryTokens(query));
  const ranked = prices
    .map((price) => ({
      price,
      score: scoreText(`${price.product} ${price.url} ${price.context}`, tokens),
    }))
    .sort((left, right) => right.score - left.score);

  const matched = ranked.filter((item) => item.score >= Math.min(2, tokens.length));
  const chosen = (matched.length > 0 ? matched : ranked).map((item) => item.price);

  const unique = new Map<string, PagePrice>();
  for (const price of chosen) {
    const key = `${price.url}|${price.amount}`;
    if (!unique.has(key)) {
      unique.set(key, price);
    }
  }

  return [...unique.values()].slice(0, 4);
}

export async function collectSitePrices(input: {
  website?: string | null;
  query: string;
  sellerName: string;
}): Promise<SiteEvidence> {
  const base = input.website ? normalizeWebsite(input.website) : null;

  if (!base) {
    return {
      pages: [],
      prices: [],
      note: "Kaynak site yok; fiyat yalnızca genel web taramasına bırakıldı.",
    };
  }

  const tokens = skuTokens(queryTokens(input.query));
  const queue = [base.toString(), ...searchUrls(base, input.query)];
  const seen = new Set<string>();
  const pages: SiteEvidence["pages"] = [];
  const rawPrices: PagePrice[] = [];

  for (const url of queue) {
    if (seen.has(url) || seen.size >= 5) {
      continue;
    }
    seen.add(url);

    const page = await fetchHtml(url);
    if (!page || page.status >= 400) {
      pages.push({ url, title: "", status: page?.status ?? 0 });
      continue;
    }

    const title = pageTitle(page.html);
    pages.push({ url: page.url, title, status: page.status });
    rawPrices.push(
      ...extractJsonLdPrices(page.html, page.url),
      ...extractMetaPrice(page.html, page.url, title),
    );

    for (const link of findProductLinks(page.html, new URL(page.url), tokens)) {
      if (!queue.includes(link)) {
        queue.push(link);
      }
    }
  }

  const prices = pickBest(rawPrices, input.query).map((price) => ({
    ...price,
    product: price.product || input.query,
  }));

  return {
    pages,
    prices,
    note: prices.length
      ? `${base.host} sayfasından doğrulanmış güncel fiyat.`
      : `${base.host} açıldı ama bu ürüne ait net fiyat etiketi bulunamadı. Model tahmin fiyat yazmamalı.`,
  };
}
