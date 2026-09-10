import { AiProvider as PrismaAiProvider } from "@prisma/client";
import { decrypt, encrypt, maskSecret } from "@/lib/crypto";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  FALLBACK_GROQ_MODEL,
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
      return DEFAULT_GROQ_MODEL;
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
      return {
        provider,
        model: stored.model || defaultModel(provider),
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
    model: defaultModel(provider),
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

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("Model geçersiz yanıt döndü.");
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

async function completeGroq(
  config: ResolvedAiConfig,
  system: string,
  user: string,
  model = config.model,
) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;

  if (response.status === 429 && model !== FALLBACK_GROQ_MODEL) {
    return completeGroq(config, system, user, FALLBACK_GROQ_MODEL);
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? `Groq isteği başarısız (${response.status}).`,
    );
  }

  const text = payload?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Groq boş yanıt döndü.");
  }

  return { text, model };
}

async function completeGemini(
  config: ResolvedAiConfig,
  system: string,
  user: string,
) {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
  );
  url.searchParams.set("key", config.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.3,
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

export async function completeJson(
  system: string,
  user: string,
  config?: ResolvedAiConfig | null,
) {
  const resolved = config ?? (await resolveAiConfig());

  if (!resolved) {
    throw new Error("Yapay zeka anahtarı tanımlı değil.");
  }

  const completion =
    resolved.provider === "GROQ"
      ? await completeGroq(resolved, system, user)
      : await completeGemini(resolved, system, user);

  return {
    data: extractJsonObject(completion.text),
    provider: resolved.provider,
    model: completion.model,
  };
}

export async function testAiConnection() {
  const started = Date.now();
  const result = await completeJson(
    "Sadece geçerli JSON döndür.",
    'Şu JSON\'u birebir üret: {"ok":true}',
  );

  return {
    ok: result.data.ok === true,
    provider: result.provider,
    model: result.model,
    latencyMs: Date.now() - started,
  };
}
