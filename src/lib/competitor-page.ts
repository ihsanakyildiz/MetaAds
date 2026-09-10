export type PagePrice = {
  amount: number;
  currency: string;
  product: string;
  url: string;
  context: string;
  verified: true;
};

export type DetectedSearch = {
  path: string;
  queryParam: string;
  extraQuery: string;
  source: string;
  template: string;
};

export type SiteEvidence = {
  pages: Array<{ url: string; title: string; status: number }>;
  prices: PagePrice[];
  note: string;
  search: DetectedSearch | null;
};

const SEARCH_PARAM_NAMES = [
  "kelime",
  "q",
  "query",
  "s",
  "search",
  "term",
  "k",
  "word",
  "keyword",
  "keywords",
  "searchterm",
  "search_query",
  "aranacak",
  "aranan",
];

const CONTROL_INPUT_NAMES = /^(txtbx|btn|ddl|btnkelime|hdn|__)/i;

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
  return tokens.reduce((sum, token) => {
    if (haystack.includes(token)) {
      return sum + 1;
    }

    const digits = token.replace(/\D/g, "");
    if (digits.length >= 4) {
      const shorter = digits.slice(0, -1);
      if (shorter.length >= 4 && haystack.includes(shorter)) {
        return sum + 1;
      }
    }

    return sum;
  }, 0);
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

function attr(tag: string, name: string) {
  const match =
    tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i")) ||
    tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function pageTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decode(match?.[1] ?? "").slice(0, 180);
}

function encodeSearchValue(query: string) {
  return encodeURIComponent(query).replace(/%20/g, "+");
}

function sameOrigin(base: URL, href: string) {
  try {
    const next = new URL(href, base);
    if (next.origin !== base.origin) {
      return null;
    }
    return next;
  } catch {
    return null;
  }
}

function asDetectedSearch(input: {
  path: string;
  queryParam: string;
  extraQuery?: string;
  source: string;
}): DetectedSearch | null {
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  const queryParam = input.queryParam.trim().toLocaleLowerCase("tr-TR");
  if (!path || !queryParam) {
    return null;
  }

  const extraQuery = (input.extraQuery ?? "").replace(/^[?&]+/, "").replace(/&+$/, "");
  const template = extraQuery
    ? `${path}?${extraQuery}&${queryParam}=`
    : `${path}?${queryParam}=`;

  return {
    path,
    queryParam,
    extraQuery,
    source: input.source,
    template,
  };
}

function buildSearchUrl(base: URL, detected: DetectedSearch, query: string) {
  const encoded = encodeSearchValue(query);
  const extra = detected.extraQuery ? `${detected.extraQuery}&` : "";
  return `${base.origin}${detected.path}?${extra}${detected.queryParam}=${encoded}`;
}

function formatExtraParams(params: Array<[string, string]>, skip: string) {
  return params
    .filter(([key]) => key !== skip)
    .map(([key, value]) => (value ? `${key}=${value}` : key))
    .join("&");
}

function chooseSearchParam(url: URL) {
  const params = [...url.searchParams.entries()];
  const known = params.find(([key]) => pickSearchParam(key));
  if (known) {
    return known[0];
  }

  const named = [...params]
    .reverse()
    .find(([key]) => key && !/^\d+$/.test(key) && !CONTROL_INPUT_NAMES.test(key));
  return named?.[0] ?? "";
}

function resolveTemplateUrl(template: string, website?: string | null) {
  const cleaned = template
    .trim()
    .replace(/\{(?:q|query|kelime|search|aranan)\}/gi, "");
  const site = website ? normalizeWebsite(website) : null;

  if (/^https?:\/\//i.test(cleaned)) {
    return normalizeWebsite(cleaned);
  }

  if (!site) {
    return null;
  }

  const path = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  return normalizeWebsite(`${site.origin}${path}`);
}

export function parseManualSearchTemplate(
  template?: string | null,
  website?: string | null,
): { base: URL; search: DetectedSearch } | null {
  const raw = template?.trim();
  if (!raw) {
    return null;
  }

  const parsed = resolveTemplateUrl(raw, website);
  if (!parsed) {
    return null;
  }

  const queryParam = chooseSearchParam(parsed);
  if (!queryParam) {
    return null;
  }

  const search = asDetectedSearch({
    path: parsed.pathname,
    queryParam,
    extraQuery: formatExtraParams([...parsed.searchParams.entries()], queryParam),
    source: "elle girilen arama adresi",
  });

  if (!search) {
    return null;
  }

  return { base: parsed, search };
}

function pickSearchParam(name: string) {
  const lowered = name.trim().toLocaleLowerCase("tr-TR");
  if (!lowered || CONTROL_INPUT_NAMES.test(lowered)) {
    return "";
  }

  return SEARCH_PARAM_NAMES.includes(lowered) ? lowered : "";
}

function detectFromHref(href: string, base: URL, source: string): DetectedSearch | null {
  const next = sameOrigin(base, href);
  if (!next || next.pathname === "/") {
    return null;
  }

  if (!/(arama|search|ara)/i.test(next.pathname)) {
    return null;
  }

  const params = [...next.searchParams.entries()];
  const named = params.find(([key, value]) => {
    const param = pickSearchParam(key);
    return Boolean(param) && (!value || value.length < 80);
  });

  if (!named) {
    return null;
  }

  const extras = params
    .filter(([key]) => key !== named[0])
    .map(([key, value]) => (value ? `${key}=${value}` : key));

  return asDetectedSearch({
    path: next.pathname,
    queryParam: named[0],
    extraQuery: extras.join("&"),
    source,
  });
}

function detectFromJs(html: string, base: URL): DetectedSearch | null {
  const searchUrl =
    html.match(/globalModel\.searchUrl\s*=\s*['"]([^'"]+)['"]/i)?.[1] ||
    html.match(/searchUrl\s*[:=]\s*['"](\/[^'"]+)['"]/i)?.[1];

  const kelimeInJs =
    /[&?]kelime\s*=/.test(html) ||
    /["']kelime["']\s*[+\]]/.test(html) ||
    /\+=\s*["']&kelime=/.test(html);

  if (searchUrl && (kelimeInJs || /ticimax|txtbxArama|OnSearchTopProduct/i.test(html))) {
    const resolved = sameOrigin(base, searchUrl);
    if (resolved) {
      return asDetectedSearch({
        path: resolved.pathname,
        queryParam: "kelime",
        extraQuery: "1",
        source: "sitedeki arama scripti (searchUrl + kelime)",
      });
    }
  }

  const hrefMatch = html.match(
    /(?:href|pageUrl|action)\s*[=:]\s*['"]([^'"]*(?:Arama|arama|search)\?[^'"]*)['"]/i,
  );
  if (hrefMatch?.[1]) {
    const fromHref = detectFromHref(hrefMatch[1], base, "sayfa içindeki arama linki");
    if (fromHref) {
      return fromHref;
    }
  }

  return null;
}

function detectFromForms(html: string, base: URL): DetectedSearch | null {
  const forms = html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi);

  for (const form of forms) {
    const attrs = form[1] ?? "";
    const body = form[2] ?? "";
    const id = attr(attrs, "id");
    const action = attr(attrs, "action") || "/";

    if (/formGlobal|aspnetForm/i.test(id) || action === "./") {
      continue;
    }

    const looksLikeSearch =
      /search|arama/i.test(`${attrs} ${id}`) ||
      /type=["']search["']/i.test(body) ||
      /name=["'](?:kelime|q|s|query|search)["']/i.test(body);

    if (!looksLikeSearch) {
      continue;
    }

    const inputs = [...body.matchAll(/<input\b([^>]*)>/gi)].map((match) => match[1] ?? "");
    const searchInput = inputs.find((input) => {
      const type = attr(input, "type").toLowerCase();
      const name = pickSearchParam(attr(input, "name"));
      return Boolean(name) && (type === "search" || type === "text" || type === "");
    });

    if (!searchInput) {
      continue;
    }

    const extras = inputs
      .filter((input) => attr(input, "type").toLowerCase() === "hidden")
      .map((input) => {
        const name = attr(input, "name");
        const value = attr(input, "value");
        if (!name || CONTROL_INPUT_NAMES.test(name)) {
          return "";
        }
        return value ? `${name}=${value}` : name;
      })
      .filter(Boolean);

    const resolved = sameOrigin(base, action);
    if (!resolved) {
      continue;
    }

    return asDetectedSearch({
      path: resolved.pathname,
      queryParam: attr(searchInput, "name"),
      extraQuery: extras.join("&"),
      source: `arama formu (${id || resolved.pathname})`,
    });
  }

  return null;
}

function detectFromInputs(html: string): DetectedSearch | null {
  const inputs = [...html.matchAll(/<input\b([^>]*)>/gi)].map((match) => match[1] ?? "");
  const searchBox = inputs.find((input) => {
    const type = attr(input, "type").toLowerCase();
    return type === "search" && pickSearchParam(attr(input, "name"));
  });

  if (!searchBox) {
    return null;
  }

  return asDetectedSearch({
    path: "/search",
    queryParam: attr(searchBox, "name"),
    source: "type=search giriş alanı",
  });
}

function detectFromLinks(html: string, base: URL): DetectedSearch | null {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1] ?? "");
  for (const href of hrefs) {
    const detected = detectFromHref(href, base, "sitedeki arama bağlantısı");
    if (detected) {
      return detected;
    }
  }
  return null;
}

export function detectSiteSearch(html: string, website: string): DetectedSearch | null {
  const base = normalizeWebsite(website);
  if (!base) {
    return null;
  }

  return (
    detectFromJs(html, base) ||
    detectFromForms(html, base) ||
    detectFromLinks(html, base) ||
    detectFromInputs(html)
  );
}

function fallbackSearchUrls(base: URL, query: string) {
  const encoded = encodeSearchValue(query);
  return [
    `${base.origin}/search?q=${encoded}`,
    `${base.origin}/?s=${encoded}`,
  ];
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
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
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
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
    html.match(/content=["']([^"']+)["'][^>]+product:price:amount/i);
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

function firstCardPrice(chunk: string) {
  const sale =
    chunk.match(/discountPriceSpan[^>]*>\s*([^<]+)/i) ||
    chunk.match(/itemprop=["']price["'][^>]*content=["']([^"']+)/i) ||
    chunk.match(/[₺]\s*([\d][\d.\s]*,\d{2})/) ||
    chunk.match(/([\d][\d.\s]*,\d{2})\s*(?:₺|TL)/i);

  return sale?.[1] ? parsePrice(sale[1]) : null;
}

function extractListingPrices(html: string, pageUrl: string): PagePrice[] {
  const base = normalizeWebsite(pageUrl);
  if (!base) {
    return [];
  }

  const found: PagePrice[] = [];
  const cards = html.matchAll(/<div[^>]*productName[^>]*>/gi);

  for (const card of cards) {
    const chunk = html.slice(card.index ?? 0, (card.index ?? 0) + 1800);
    const link = chunk.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const href = link ? attr(link[1] ?? "", "href") : "";
    const next = href ? sameOrigin(base, href) : null;
    if (!next) {
      continue;
    }

    const product = decode(attr(link?.[1] ?? "", "title") || link?.[2] || "");
    const sku = chunk.match(/productStokKodu[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const amount = firstCardPrice(chunk);
    if (amount === null || !product) {
      continue;
    }

    found.push({
      amount,
      currency: "TRY",
      product: sku?.[1] ? `${product} (${decode(sku[1])})` : product,
      url: next.toString(),
      context: "listing",
      verified: true,
    });
  }

  if (found.length > 0) {
    return found.slice(0, 8);
  }

  const links = html.matchAll(
    /<a\b([^>]*)>([\s\S]*?)<\/a>([\s\S]{0,700})/gi,
  );

  for (const link of links) {
    const tag = link[1] ?? "";
    const href = attr(tag, "href");
    const next = href ? sameOrigin(base, href) : null;
    if (!next || next.pathname === "/" || /(arama|search|kategori|sepet|uye|hesap|login)/i.test(next.pathname)) {
      continue;
    }

    const product = decode(attr(tag, "title") || link[2] || "");
    if (product.length < 8) {
      continue;
    }

    const amount = firstCardPrice(link[3] ?? "");
    if (amount === null) {
      continue;
    }

    found.push({
      amount,
      currency: "TRY",
      product,
      url: next.toString(),
      context: "listing-link",
      verified: true,
    });
  }

  return found.slice(0, 8);
}

function findProductLinks(html: string, base: URL, tokens: string[]) {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const scored: Array<{ url: string; score: number }> = [];

  for (const href of hrefs) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
      continue;
    }

    const next = sameOrigin(base, href);
    if (!next) {
      continue;
    }

    const path = `${next.pathname} ${next.search}`.toLocaleLowerCase("tr-TR");
    if (/(arama|search|kategori|sepet|uye|hesap|login)/i.test(path)) {
      continue;
    }

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

function collectPagePrices(html: string, pageUrl: string, title: string) {
  return [
    ...extractListingPrices(html, pageUrl),
    ...extractJsonLdPrices(html, pageUrl),
    ...extractMetaPrice(html, pageUrl, title),
  ];
}

export async function collectSitePrices(input: {
  website?: string | null;
  searchTemplate?: string | null;
  query: string;
  sellerName: string;
}): Promise<SiteEvidence> {
  const manual = parseManualSearchTemplate(input.searchTemplate, input.website);
  const base = manual?.base ?? (input.website ? normalizeWebsite(input.website) : null);

  if (!base) {
    return {
      pages: [],
      prices: [],
      note: "Kaynak site yok; fiyat yalnızca genel web taramasına bırakıldı.",
      search: null,
    };
  }

  const tokens = skuTokens(queryTokens(input.query));
  const home = manual ? null : await fetchHtml(base.origin + "/");
  const detected = home?.html
    ? detectSiteSearch(home.html, base.toString())
    : null;
  const search = manual?.search ?? detected;
  const searchUrl = search ? buildSearchUrl(base, search, input.query) : null;
  const queue = searchUrl
    ? [searchUrl]
    : fallbackSearchUrls(base, input.query);
  const seen = new Set<string>();
  const pages: SiteEvidence["pages"] = [];
  const rawPrices: PagePrice[] = [];

  if (home) {
    pages.push({
      url: home.url,
      title: pageTitle(home.html),
      status: home.status,
    });
  }

  for (const url of queue) {
    if (seen.has(url) || seen.size >= 4) {
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
    rawPrices.push(...collectPagePrices(page.html, page.url, title));

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

  const searchNote = search
    ? ` Kullanılan arama adresi: ${search.template} (${search.source}).`
    : " Sitede arama formu bulunamadı ve elle arama adresi girilmedi; genel arama adresleri denendi.";

  return {
    pages,
    prices,
    search,
    note: prices.length
      ? `${base.host} arama sonuçlarından doğrulanmış güncel fiyat.${searchNote}`
      : `${base.host} açıldı ama bu ürüne ait net fiyat etiketi bulunamadı.${searchNote} Model tahmin fiyat yazmamalı.`,
  };
}
