export type SearchEngineId =
  | "google"
  | "google_shopping"
  | "bing"
  | "yandex"
  | "duckduckgo";

export const SEARCH_ENGINE_IDS: SearchEngineId[] = [
  "google",
  "google_shopping",
  "bing",
  "yandex",
  "duckduckgo",
];

export const DEFAULT_SEARCH_ENGINES: SearchEngineId[] = [...SEARCH_ENGINE_IDS];

export function searchEngineLabel(id: SearchEngineId) {
  switch (id) {
    case "google":
      return "Google";
    case "google_shopping":
      return "Google Alışveriş";
    case "bing":
      return "Bing";
    case "yandex":
      return "Yandex";
    case "duckduckgo":
      return "DuckDuckGo";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function isSearchEngineId(value: string): value is SearchEngineId {
  return SEARCH_ENGINE_IDS.includes(value as SearchEngineId);
}

export function parseSearchEngines(raw?: string | null): SearchEngineId[] {
  if (!raw?.trim()) {
    return [...DEFAULT_SEARCH_ENGINES];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_SEARCH_ENGINES];
    }

    const ids = parsed.filter(
      (item): item is SearchEngineId =>
        typeof item === "string" && isSearchEngineId(item),
    );
    return ids.length > 0 ? ids : [...DEFAULT_SEARCH_ENGINES];
  } catch {
    return [...DEFAULT_SEARCH_ENGINES];
  }
}

export function serializeSearchEngines(ids: SearchEngineId[]) {
  const unique = SEARCH_ENGINE_IDS.filter((id) => ids.includes(id));
  return JSON.stringify(unique.length > 0 ? unique : DEFAULT_SEARCH_ENGINES);
}

export function isSearchEngineHost(value?: string | null) {
  if (!value?.trim()) {
    return false;
  }

  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    return /(^|\.)(google|bing|yandex|duckduckgo|yahoo)\./i.test(url.host);
  } catch {
    return /(google|bing|yandex|duckduckgo|yahoo)\./i.test(value);
  }
}
