"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  aiBriefToneClass,
  aiCreativeVerdictLabel,
  aiCreativeVerdictTone,
  aiLikelihoodLabel,
  aiLikelihoodTone,
  aiPriorityLabel,
  aiPriorityTone,
  type AiBrief,
  type AiBriefScope,
} from "@/lib/ai-types";
import type { DateRangeValue } from "@/lib/date-range";

type AiBriefCardProps = {
  range: DateRangeValue;
  canManageSettings?: boolean;
  scope?: AiBriefScope;
  parentId?: string;
};

function emptyCopy(scope: AiBriefScope) {
  switch (scope) {
    case "adset":
      return {
        title: "Bu kampanyadaki setleri derinlemesine incele",
        detail:
          "Satış skoru, bütçe kararı, ürün kırılımı ve en çok harcayan reklam görsellerini birlikte okur.",
        button: "Setleri analiz et",
      };
    case "ad":
      return {
        title: "Reklam görsellerini ve metinleri incele",
        detail:
          "Her reklamın kapak görseli/videosu, başlık ve istatistiğini karşılaştırıp hangisini ölçekleyeceğini söyler.",
        button: "Reklamları analiz et",
      };
    case "dashboard":
      return {
        title: "Dönemi Türkçe aksiyonlara çevir",
        detail:
          "Satış skoru, uyarılar ve kreatif önizlemelerini Groq ile yorumlar. Harcama uydurmaz.",
        button: "Dönemi analiz et",
      };
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

export function AiBriefCard({
  range,
  canManageSettings = false,
  scope = "dashboard",
  parentId,
}: AiBriefCardProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [brief, setBrief] = useState<AiBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setBrief(null);
    setError("");
  }, [scope, parentId, range.since, range.until]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      const response = await fetch("/api/ai/status", { credentials: "include" });
      const payload = (await response.json().catch(() => null)) as {
        configured?: boolean;
      } | null;

      if (!cancelled) {
        setConfigured(Boolean(payload?.configured));
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  async function analyze(force = false) {
    setLoading(true);
    setError("");

    const response = await fetch("/api/ai/brief", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        parentId,
        datePreset: range.preset,
        since: range.since,
        until: range.until,
        force,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (AiBrief & { error?: string; configured?: boolean })
      | null;

    setLoading(false);

    if (response.status === 412) {
      setConfigured(false);
      setError(payload?.error ?? "Yapay zeka anahtarı yok.");
      return;
    }

    if (!response.ok || !payload || payload.error) {
      setError(payload?.error ?? "Analiz üretilemedi.");
      return;
    }

    setConfigured(true);
    setBrief(payload);
  }

  return (
    <section
      className={`rounded-3xl border p-6 ${
        brief ? aiBriefToneClass(brief.tone) : "border-indigo-200 bg-indigo-50/70"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            Yapay zeka analisti
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {brief?.headline ?? emptyCopy(scope).title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {brief?.summary ?? emptyCopy(scope).detail}
          </p>
        </div>
        <button
          type="button"
          disabled={loading || configured === false}
          onClick={() => void analyze(Boolean(brief))}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading
            ? "Analiz ediliyor..."
            : brief
              ? "Yeniden üret"
              : emptyCopy(scope).button}
        </button>
      </div>

      {configured === false ? (
        <p className="mt-4 rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-600">
          Ücretsiz Groq anahtarı henüz yok.{" "}
          {canManageSettings ? (
            <Link href="/settings" className="font-medium text-accent">
              Ayarlar’dan ekleyin
            </Link>
          ) : (
            "Yöneticinin Ayarlar’dan anahtar eklemesi gerekir."
          )}
          .
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {brief ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div className="space-y-2 xl:col-span-2">
            {brief.actions.map((action) => (
              <article
                key={action.title}
                className="rounded-xl border border-white/70 bg-white/80 px-4 py-3"
              >
                <StatusBadge tone={aiPriorityTone(action.priority)}>
                  {aiPriorityLabel(action.priority)}
                </StatusBadge>
                <p className="mt-1 font-medium">{action.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {action.detail}
                </p>
              </article>
            ))}
            {(brief.scenarios ?? []).length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Olası nedenler
                </p>
                {(brief.scenarios ?? []).map((scenario) => (
                  <article
                    key={scenario.title}
                    className="rounded-xl border border-white/70 bg-white/80 px-4 py-3"
                  >
                    <StatusBadge tone={aiLikelihoodTone(scenario.likelihood)}>
                      {aiLikelihoodLabel(scenario.likelihood)}
                    </StatusBadge>
                    <p className="mt-1 font-medium">{scenario.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {scenario.detail}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
            {(brief.creativeReviews ?? []).length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Görsel / video incelemesi
                </p>
                {(brief.creativeReviews ?? []).map((review) => (
                  <article
                    key={review.name}
                    className="rounded-xl border border-white/70 bg-white/80 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={aiCreativeVerdictTone(review.verdict)}>
                        {aiCreativeVerdictLabel(review.verdict)}
                      </StatusBadge>
                      <span className="text-xs text-slate-500">{review.kind}</span>
                    </div>
                    <p className="mt-1 font-medium">{review.name}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {review.notes}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-3">
            {brief.scaleCandidates.length > 0 ? (
              <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Ölçekle
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {brief.scaleCandidates.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {brief.closeCandidates.length > 0 ? (
              <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Kapatmayı değerlendir
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {brief.closeCandidates.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {brief.creativeNote ? (
              <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Kreatif
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {brief.creativeNote}
                </p>
              </div>
            ) : null}
            <p className="text-xs text-slate-500">
              {brief.provider} · {brief.model}
              {(brief.inspectedMedia ?? 0) > 0
                ? ` · ${brief.inspectedMedia} görsel incelendi`
                : ""}
              {brief.cached ? " · önbellek" : ""}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
