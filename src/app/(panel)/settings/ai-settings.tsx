"use client";

import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { CloseSecretDialog } from "@/components/ads/close-secret-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  aiProviderLabel,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  type AiProvider,
  type AiStatus,
} from "@/lib/ai-types";

type AiSettingsProps = {
  initial: AiStatus;
};

export function AiSettings({ initial }: AiSettingsProps) {
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [status, setStatus] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState("");

  function onProviderChange(next: AiProvider) {
    setProvider(next);
    setModel(next === "GROQ" ? DEFAULT_GROQ_MODEL : DEFAULT_GEMINI_MODEL);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogError("");
    setDialogOpen(true);
  }

  async function save(closePassword: string) {
    setSaving(true);
    setMessage("");
    setFormError("");
    setDialogError("");

    const response = await fetch("/api/ai/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        model,
        apiKey: apiKey.trim() || undefined,
        enabled,
        closePassword,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (AiStatus & { error?: string })
      | null;

    setSaving(false);

    if (!response.ok || !payload || payload.error) {
      const error = payload?.error ?? "Kayıt başarısız.";
      if (response.status === 403) {
        setDialogError(error);
        return;
      }

      setDialogOpen(false);
      setFormError(error);
      return;
    }

    setDialogOpen(false);
    setApiKey("");
    setStatus(payload);
    setMessage("Yapay zeka ayarları kaydedildi.");
  }

  async function testConnection() {
    setTesting(true);
    setMessage("");
    setFormError("");

    const response = await fetch("/api/ai/test", {
      method: "POST",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      model?: string;
      latencyMs?: number;
      error?: string;
    } | null;

    setTesting(false);

    if (!response.ok || !payload || payload.error) {
      setFormError(payload?.error ?? "Bağlantı testi başarısız.");
      return;
    }

    setMessage(
      `Bağlantı tamam. ${payload.model ?? "model"} · ${payload.latencyMs ?? 0} ms`,
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Yapay zeka analisti</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Ücretsiz Groq anahtarı ile dashboard dönemini Türkçe aksiyonlara
            çevirir. Kart bilgisi gerekmez. Gemini de eklenebilir ama ücretsiz
            kotası çok daha dardır.
          </p>
        </div>
        <StatusBadge tone={status.configured ? "success" : "neutral"}>
          {status.configured ? "Anahtar tanımlı" : "Anahtar yok"}
        </StatusBadge>
      </div>

      <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent hover:text-accent-strong"
          >
            console.groq.com/keys
          </a>{" "}
          adresinden ücretsiz API key alın.
        </li>
        <li>Aşağıya yapıştırıp onay şifresiyle kaydedin.</li>
        <li>Dashboard’da “Dönemi analiz et” ile kullanın.</li>
      </ol>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Analisti açık tut
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Sağlayıcı</span>
          <select
            value={provider}
            onChange={(event) =>
              onProviderChange(event.target.value as AiProvider)
            }
            className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
          >
            <option value="GROQ">{aiProviderLabel("GROQ")}</option>
            <option value="GEMINI">{aiProviderLabel("GEMINI")}</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Model</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
          />
          <span className="mt-1.5 block text-xs text-slate-500">
            Önerilen Groq modeli {DEFAULT_GROQ_MODEL}. Kota dolarsa sistem{" "}
            {provider === "GROQ" ? "daha hafif modele" : "aynı anahtara"} düşer.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">API anahtarı</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              status.keyMasked
                ? `Kayıtlı: ${status.keyMasked}`
                : "gsk_... veya Gemini key"
            }
            className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
          />
          <span className="mt-1.5 block text-xs text-slate-500">
            Boş bırakırsanız mevcut anahtar korunur. Anahtar veritabanında
            şifrelenir.
          </span>
        </label>

        {formError ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {formError}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
          <button
            type="button"
            disabled={testing || !status.configured}
            onClick={() => void testConnection()}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            {testing ? "Test ediliyor..." : "Bağlantıyı dene"}
          </button>
        </div>
      </form>

      <CloseSecretDialog
        open={dialogOpen}
        title="Yapay zeka ayarını kaydet"
        description="API anahtarı şifrelenerek saklanır. Onay şifresi gerekir."
        confirmLabel="Kaydet"
        submitting={saving}
        error={dialogError}
        onCancel={() => setDialogOpen(false)}
        onConfirm={(password) => void save(password)}
      />
    </section>
  );
}
