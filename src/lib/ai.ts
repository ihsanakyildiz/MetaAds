import { AiProvider as PrismaAiProvider } from "@prisma/client";
import { decrypt, encrypt, maskSecret } from "@/lib/crypto";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  GROQ_MODEL_CHAIN,
  GROQ_VISION_MODEL,
  resolveGroqModel,
  type AiProvider,
  type AiStatus,
} from "@/lib/ai-types";
import { prisma } from "@/lib/prisma";

export type ResolvedAiConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  source: "database" | "env";
};

function toAppProvider(provider: PrismaAiProvider): AiProvider {
  switch (provider) {
    case PrismaAiProvider.GROQ:
      return "GROQ";
    case PrismaAiProvider.GEMINI:
      return "GEMINI";
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function toPrismaProvider(provider: AiProvider): PrismaAiProvider {
  switch (provider) {
    case "GROQ":
      return PrismaAiProvider.GROQ;
    case "GEMINI":
      return PrismaAiProvider.GEMINI;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function envProvider(): AiProvider | null {
  const raw = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();

  if (raw === "gemini") {
    return "GEMINI";
  }

  if (raw === "groq") {
    return "GROQ";
  }

  if (process.env.GROQ_API_KEY?.trim()) {
    return "GROQ";
  }

  if (process.env.GEMINI_API_KEY?.trim()) {
    return "GEMINI";
  }

  return null;
}

function envKey(provider: AiProvider) {
  switch (provider) {
    case "GROQ":
      return process.env.GROQ_API_KEY?.trim() || "";
    case "GEMINI":
      return process.env.GEMINI_API_KEY?.trim() || "";
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function defaultModel(provider: AiProvider) {
  const override = process.env.AI_MODEL?.trim();

  if (override) {
    return override;
  }

  switch (provider) {
    case "GROQ":
      return resolveGroqModel(DEFAULT_GROQ_MODEL);
    case "GEMINI":
      return DEFAULT_GEMINI_MODEL;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

async function readStoredSettings() {
  return prisma.aiSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });
}

export async function resolveAiConfig(): Promise<ResolvedAiConfig | null> {
  const stored = await readStoredSettings();

  if (stored && !stored.enabled) {
    return null;
  }

  if (stored && stored.enabled) {
    const provider = toAppProvider(stored.provider);
    let apiKey = "";

    if (stored.apiKey) {
      try {
        apiKey = decrypt(stored.apiKey);
      } catch {
        apiKey = "";
      }
    }

    if (!apiKey) {
      apiKey = envKey(provider);
    }

    if (apiKey) {
      const model = stored.model || defaultModel(provider);
      return {
        provider,
        model:
          provider === "GROQ" ? resolveGroqModel(model) : model,
        apiKey,
        source: stored.apiKey ? "database" : "env",
      };
    }
  }

  const provider = envProvider();

  if (!provider) {
    return null;
  }

  const apiKey = envKey(provider);

  if (!apiKey) {
    return null;
  }

  return {
    provider,
    model:
      provider === "GROQ"
        ? resolveGroqModel(defaultModel(provider))
        : defaultModel(provider),
    apiKey,
    source: "env",
  };
}

export async function getAiStatus(): Promise<AiStatus> {
  const stored = await readStoredSettings();
  const resolved = await resolveAiConfig();

  if (resolved) {
    return {
      configured: true,
      enabled: stored?.enabled ?? true,
      provider: resolved.provider,
      model: resolved.model,
      source: resolved.source,
      hasKey: true,
      keyMasked: maskSecret(resolved.apiKey, 4),
    };
  }

  const provider = stored
    ? toAppProvider(stored.provider)
    : envProvider() ?? "GROQ";

  return {
    configured: false,
    enabled: stored?.enabled ?? true,
    provider,
    model: stored?.model || defaultModel(provider),
    source: null,
    hasKey: false,
    keyMasked: null,
  };
}

export async function saveAiSettings(input: {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  enabled: boolean;
  updatedById: string;
}) {
  const existing = await readStoredSettings();
  const keepKey = existing?.apiKey || "";
  const nextKey = input.apiKey?.trim()
    ? encrypt(input.apiKey.trim())
    : keepKey;
  const model = input.model.trim() || defaultModel(input.provider);
  const data = {
    provider: toPrismaProvider(input.provider),
    model,
    apiKey: nextKey,
    enabled: input.enabled,
    updatedById: input.updatedById,
  };

  if (existing) {
    return prisma.aiSettings.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.aiSettings.create({ data });
}

function groqErrorMessage(payload: unknown, status: number) {
  if (!payload || typeof payload !== "object") {
    return `Groq isteği başarısız (${status}).`;
  }

  const error = (payload as { error?: { message?: string } | string }).error;

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object" && error.message) {
    return error.message;
  }

  return `Groq isteği başarısız (${status}).`;
}

function groqMessageText(payload: {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
      reasoning?: string;
    };
  }>;
}) {
  const message = payload.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (joined) {
      return joined;
    }
  }

  if (message?.reasoning?.trim()) {
    return message.reasoning;
  }

  return "";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("Model geçersiz yanıt döndü.");
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

type GroqContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function publicMediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  if (url.startsWith("/") && appUrl) {
    return `${appUrl}${url}`;
  }

  return "";
}

export function normalizeMediaUrls(urls: string[], limit = 3) {
  const unique = new Set<string>();

  for (const raw of urls) {
    const next = publicMediaUrl(raw.trim());
    if (next) {
      unique.add(next);
    }
    if (unique.size >= limit) {
      break;
    }
  }

  return [...unique];
}

async function completeGroq(
  config: ResolvedAiConfig,
  system: string,
  user: string,
  options?: {
    images?: string[];
    model?: string;
    tried?: string[];
  },
) {
  const images = normalizeMediaUrls(options?.images ?? []);
  const model =
    options?.model ??
    (images.length > 0 ? GROQ_VISION_MODEL : resolveGroqModel(config.model));
  const tried = options?.tried ?? [];
  const userContent: string | GroqContentPart[] =
    images.length > 0
      ? [
          { type: "text", text: user },
          ...images.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ]
      : user;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string } | string;
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }>;
        reasoning?: string;
      };
    }>;
  } | null;

  const nextTried = [...tried, model];
  const shouldRetry =
    response.status === 429 ||
    response.status === 400 ||
    response.status === 404;

  if (!response.ok && shouldRetry && images.length > 0) {
    return completeGroq(config, system, user, {
      images: [],
      model: resolveGroqModel(config.model),
      tried: nextTried,
    });
  }

  const nextModel = GROQ_MODEL_CHAIN.find((item) => !nextTried.includes(item));

  if (!response.ok && shouldRetry && nextModel) {
    return completeGroq(config, system, user, {
      images: [],
      model: nextModel,
      tried: nextTried,
    });
  }

  if (!response.ok) {
    throw new Error(groqErrorMessage(payload, response.status));
  }

  const text = groqMessageText(payload ?? {});

  if (!text) {
    throw new Error("Groq boş yanıt döndü.");
  }

  return { text, model };
}

async function completeGemini(
  config: ResolvedAiConfig,
  system: string,
  user: string,
  images: string[] = [],
) {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
  );
  url.searchParams.set("key", config.apiKey);

  const parts: Array<Record<string, unknown>> = [{ text: user }];
  for (const imageUrl of normalizeMediaUrls(images)) {
    parts.push({
      fileData: {
        mimeType: "image/jpeg",
        fileUri: imageUrl,
      },
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  } | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? `Gemini isteği başarısız (${response.status}).`,
    );
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini boş yanıt döndü.");
  }

  return { text, model: config.model };
}

function searchCountryName(code: string) {
  const normalized = code.trim().toUpperCase();

  switch (normalized) {
    case "TR":
      return "turkey";
    case "GB":
    case "UK":
      return "united kingdom";
    case "DE":
      return "germany";
    case "US":
      return "united states";
    default:
      return "turkey";
  }
}

type WebResearchTool = "web_search" | "visit_website";

export async function completeWebResearch(
  system: string,
  user: string,
  country = "TR",
  tools: WebResearchTool[] = ["web_search", "visit_website"],
) {
  const resolved = await resolveAiConfig();

  if (!resolved) {
    throw new Error("Yapay zeka anahtarı tanımlı değil.");
  }

  if (resolved.provider !== "GROQ") {
    return completeJson(
      system,
      `${user}\nNot: Canlı web araması yalnızca Groq Compound ile çalışır.`,
      resolved,
    );
  }

  const models = ["groq/compound", "groq/compound-mini"] as const;
  const enabledTools = tools.length > 0 ? tools : ["web_search", "visit_website"];

  for (const [index, model] of models.entries()) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
        "Groq-Model-Version": "latest",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        search_settings: {
          country: searchCountryName(country),
        },
        compound_custom: {
          tools: {
            enabled_tools: enabledTools,
          },
        },
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string } | string;
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string }>;
          reasoning?: string;
        };
      }>;
    } | null;

    if (!response.ok) {
      if (index < models.length - 1) {
        continue;
      }

      throw new Error(groqErrorMessage(payload, response.status));
    }

    const text = groqMessageText(payload ?? {});

    if (!text) {
      if (index < models.length - 1) {
        continue;
      }

      throw new Error("Web araştırması boş döndü.");
    }

    return {
      data: extractJsonObject(text),
      provider: resolved.provider,
      model,
    };
  }

  throw new Error("Web araştırması başarısız.");
}

export async function completeJson(
  system: string,
  user: string,
  config?: ResolvedAiConfig | null,
  images: string[] = [],
) {
  const resolved = config ?? (await resolveAiConfig());

  if (!resolved) {
    throw new Error("Yapay zeka anahtarı tanımlı değil.");
  }

  const completion =
    resolved.provider === "GROQ"
      ? await completeGroq(resolved, system, user, { images })
      : await completeGemini(resolved, system, user, images);

  return {
    data: extractJsonObject(completion.text),
    provider: resolved.provider,
    model: completion.model,
  };
}

async function assertGroqKey(apiKey: string) {
  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Groq anahtarı geçersiz veya yetkisiz.");
  }

  if (!response.ok) {
    throw new Error(groqErrorMessage(await response.json().catch(() => null), response.status));
  }
}

export async function testAiConnection() {
  const started = Date.now();
  const config = await resolveAiConfig();

  if (!config) {
    throw new Error("Yapay zeka anahtarı tanımlı değil.");
  }

  if (config.provider === "GROQ") {
    await assertGroqKey(config.apiKey);
  }

  const result = await completeJson(
    "Sadece geçerli JSON döndür.",
    'Şu JSON\'u birebir üret: {"ok":true}',
    config,
  );

  if (result.data.ok !== true) {
    throw new Error("Anahtar çalıştı ama model beklenen JSON'u üretmedi.");
  }

  return {
    ok: true,
    provider: result.provider,
    model: result.model,
    latencyMs: Date.now() - started,
  };
}
