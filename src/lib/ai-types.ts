export type AiProvider = "GROQ" | "GEMINI";

export type AiBriefTone = "success" | "warning" | "accent" | "neutral";

export type AiActionPriority = "high" | "medium" | "low";

export type AiAction = {
  title: string;
  detail: string;
  priority: AiActionPriority;
};

export type AiBrief = {
  headline: string;
  summary: string;
  tone: AiBriefTone;
  actions: AiAction[];
  closeCandidates: string[];
  scaleCandidates: string[];
  creativeNote: string;
  provider: AiProvider;
  model: string;
  cached: boolean;
  generatedAt: string;
};

export type AiStatus = {
  configured: boolean;
  enabled: boolean;
  provider: AiProvider;
  model: string;
  source: "database" | "env" | null;
  hasKey: boolean;
  keyMasked: string | null;
};

export type AiSettingsView = AiStatus & {
  canManage: boolean;
};

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_GROQ_MODEL = "openai/gpt-oss-20b";
export const GROQ_MODEL_CHAIN = [
  DEFAULT_GROQ_MODEL,
  "qwen/qwen3.6-27b",
  FALLBACK_GROQ_MODEL,
] as const;
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

const DEPRECATED_GROQ_MODELS: Record<string, string> = {
  "llama-3.3-70b-versatile": DEFAULT_GROQ_MODEL,
  "llama-3.1-8b-instant": FALLBACK_GROQ_MODEL,
  "llama-3.1-70b-versatile": DEFAULT_GROQ_MODEL,
  "llama3-70b-8192": DEFAULT_GROQ_MODEL,
  "llama3-8b-8192": FALLBACK_GROQ_MODEL,
};

export function resolveGroqModel(model: string) {
  return DEPRECATED_GROQ_MODELS[model] ?? model;
}

export function aiProviderLabel(provider: AiProvider) {
  switch (provider) {
    case "GROQ":
      return "Groq (ücretsiz)";
    case "GEMINI":
      return "Google Gemini (ücretsiz kotası dar)";
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export function aiBriefToneClass(tone: AiBriefTone) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50/80";
    case "warning":
      return "border-amber-200 bg-amber-50/80";
    case "accent":
      return "border-indigo-200 bg-indigo-50/80";
    case "neutral":
      return "border-line bg-slate-50";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function aiPriorityLabel(priority: AiActionPriority) {
  switch (priority) {
    case "high":
      return "Acil";
    case "medium":
      return "Bu hafta";
    case "low":
      return "İzle";
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}

export function aiPriorityTone(
  priority: AiActionPriority,
): "danger" | "warning" | "neutral" {
  switch (priority) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
      return "neutral";
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}
