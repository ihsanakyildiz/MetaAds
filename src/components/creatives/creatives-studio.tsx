"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  ImagePlus,
  Images,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { CreativesCharts } from "@/components/creatives/creatives-charts";
import { ProbabilityRing } from "@/components/creatives/probability-ring";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import type {
  CreativeAction,
  CreativeCard,
  CreativeConfidence,
  CreativeKind,
  CreativesPayload,
} from "@/lib/creatives-types";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

type FilterKey = "all" | "USE" | "TEST" | "AVOID" | "IMAGE" | "VIDEO" | "UPLOAD";

type CreativesStudioProps = {
  canUpload: boolean;
};

function actionLabel(action: CreativeAction) {
  switch (action) {
    case "USE":
      return "Kullan";
    case "TEST":
      return "Test et";
    case "AVOID":
      return "Kaçın";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function actionTone(action: CreativeAction): "success" | "warning" | "danger" {
  switch (action) {
    case "USE":
      return "success";
    case "TEST":
      return "warning";
    case "AVOID":
      return "danger";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function confidenceLabel(value: CreativeConfidence) {
  switch (value) {
    case "HIGH":
      return "Yüksek güven";
    case "MEDIUM":
      return "Orta güven";
    case "LOW":
      return "Düşük güven";
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function insightTone(tone: CreativesPayload["insight"]["tone"]) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50/80 text-emerald-950";
    case "warning":
      return "border-amber-200 bg-amber-50/80 text-amber-950";
    case "accent":
      return "border-indigo-200 bg-indigo-50/80 text-indigo-950";
    case "neutral":
      return "border-line bg-slate-50 text-slate-800";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

function kindLabel(kind: CreativeKind) {
  return kind === "VIDEO" ? "Video" : "Görsel";
}

export function CreativesStudio({ canUpload }: CreativesStudioProps) {
  const [payload, setPayload] = useState<CreativesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  async function loadStudio() {
    setLoading(true);
    setError("");

    const response = await fetch("/api/creatives", { credentials: "include" });
    const data = (await response.json().catch(() => null)) as
      | (CreativesPayload & { error?: string })
      | null;

    setLoading(false);

    if (!response.ok || !data) {
      setError(data?.error ?? "Kreatif önerileri yüklenemedi.");
      return;
    }

    setPayload(data);
  }

  useEffect(() => {
    void loadStudio();
  }, []);

  const items = useMemo(() => {
    const rows = payload?.items ?? [];

    switch (filter) {
      case "USE":
      case "TEST":
      case "AVOID":
        return rows.filter((item) => item.action === filter);
      case "IMAGE":
      case "VIDEO":
        return rows.filter((item) => item.kind === filter);
      case "UPLOAD":
        return rows.filter((item) => item.source === "UPLOAD");
      case "all":
        return rows;
      default: {
        const _exhaustive: never = filter;
        return _exhaustive;
      }
    }
  }, [filter, payload?.items]);

  async function uploadFile(file: File, name?: string) {
    setUploading(true);
    setError("");
    setMessage("");

    const body = new FormData();
    body.set("file", file);
    if (name) {
      body.set("name", name);
    }

    const response = await fetch("/api/creatives/upload", {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setUploading(false);

    if (!response.ok) {
      setError(data?.error ?? "Dosya yüklenemedi.");
      return;
    }

    setMessage(`“${file.name}” yüklendi. Benzer geçmiş kreatiflere göre skorlandı.`);
    await loadStudio();
  }

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      await uploadFile(file);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    void onPick(event.dataTransfer.files);
  }

  async function removeUpload(item: CreativeCard) {
    const id = item.id.replace(/^upload:/, "");
    if (
      !window.confirm(`“${item.name}” yüklemesi silinsin mi?`)
    ) {
      return;
    }

    setDeletingId(item.id);
    const response = await fetch(`/api/creatives/upload/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setDeletingId("");

    if (!response.ok) {
      setError("Yükleme silinemedi.");
      return;
    }

    await loadStudio();
  }

  const stats = payload?.stats;

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {payload ? (
        <section className={`rounded-3xl border p-6 ${insightTone(payload.insight.tone)}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-current/60">
            Akıllı öneri
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {payload.insight.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-current/80">
            {payload.insight.detail}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Analiz edilen kreatif"
          value={loading ? "…" : formatNumber(stats?.total)}
          hint={`${stats?.metaCount ?? 0} geçmiş · ${stats?.uploadCount ?? 0} yükleme`}
          icon={Images}
        />
        <StatCard
          label="En yüksek satış olasılığı"
          value={
            stats?.bestProbability === null || stats?.bestProbability === undefined
              ? "—"
              : formatPercent(stats.bestProbability)
          }
          hint="Yeni kampanyada kullanırsanız"
          icon={Sparkles}
          tone="success"
        />
        <StatCard
          label="Kullan / test / kaçın"
          value={
            loading
              ? "…"
              : `${stats?.useCount ?? 0} / ${stats?.testCount ?? 0} / ${stats?.avoidCount ?? 0}`
          }
          hint="Öneri dağılımı"
          icon={ImagePlus}
          tone="accent"
        />
        <StatCard
          label="Bağlanan satış"
          value={loading ? "…" : formatNumber(stats?.totalPurchases)}
          hint="Reklam seti satışları kreatiflere paylaştırıldı"
          icon={Video}
          tone="warning"
        />
      </section>

      {payload ? (
        <CreativesCharts
          distribution={payload.distribution}
          kindStats={payload.kindStats}
          topBars={payload.topBars}
        />
      ) : null}

      {canUpload ? (
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
            dragOver
              ? "border-accent bg-blue-50"
              : "border-line bg-card hover:border-accent/50 hover:bg-slate-50"
          }`}
        >
          <Upload className="h-8 w-8 text-accent" />
          <p className="mt-3 font-semibold">Yeni görsel veya video yükle</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            JPG, PNG, WEBP, GIF, MP4, WEBM veya MOV. Sistem geçmiş banner ve
            videolarla karşılaştırıp tahmini satış olasılığı üretir.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              void onPick(event.target.files);
              event.target.value = "";
            }}
          />
          <span className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            {uploading ? "Yükleniyor..." : "Dosya seç"}
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Tümü"],
            ["USE", "Kullan"],
            ["TEST", "Test et"],
            ["AVOID", "Kaçın"],
            ["IMAGE", "Görseller"],
            ["VIDEO", "Videolar"],
            ["UPLOAD", "Yüklenenler"],
          ] as Array<[FilterKey, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === key
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Kreatifler analiz ediliyor...</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card px-6 py-16 text-center text-sm text-slate-500">
          Bu filtreye uyan kreatif yok. Reklamları yenileyin veya yeni dosya yükleyin.
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CreativeCardView
              key={item.id}
              item={item}
              canUpload={canUpload}
              deleting={deletingId === item.id}
              onDelete={() => void removeUpload(item)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function CreativeCardView({
  item,
  canUpload,
  deleting,
  onDelete,
}: {
  item: CreativeCard;
  canUpload: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const sourceLabel = item.source === "UPLOAD" ? "Yükleme" : "Meta geçmişi";

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="relative aspect-[4/3] bg-slate-100">
        {item.kind === "VIDEO" && item.previewUrl?.startsWith("/uploads/") ? (
          <video
            src={item.previewUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Önizleme yok
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          <StatusBadge tone={actionTone(item.action)}>
            {actionLabel(item.action)}
          </StatusBadge>
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {kindLabel(item.kind)} · {sourceLabel}
          </span>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{item.name}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {confidenceLabel(item.confidence)}
              {item.adsCount > 0 ? ` · ${item.adsCount} reklam` : ""}
              {item.campaignsCount > 0 ? ` · ${item.campaignsCount} kampanya` : ""}
            </p>
          </div>
          <ProbabilityRing value={item.sellProbability} />
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Bu {item.kind === "VIDEO" ? "videoyu" : "görseli"} kullanırsanız satış
          alma olasılığınız{" "}
          <span className="font-semibold text-slate-900">
            %{Math.round(item.sellProbability)}
          </span>
          .
        </p>
        <ul className="space-y-1.5 text-sm text-slate-500">
          {item.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
        {item.source === "META" ? (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
            <div>
              <p className="font-semibold text-slate-800">
                {formatMoney(item.spend, item.currency)}
              </p>
              <p>Harcama</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {formatNumber(item.purchases)}
              </p>
              <p>Satış</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {item.ctr === null ? "—" : formatPercent(item.ctr)}
              </p>
              <p>CTR</p>
            </div>
          </div>
        ) : null}
        {canUpload && item.source === "UPLOAD" ? (
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Siliniyor..." : "Yüklemeyi sil"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
