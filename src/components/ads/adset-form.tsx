"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CloseSecretDialog } from "@/components/ads/close-secret-dialog";
import {
  EntityFormModal,
  Field,
  fieldClassName,
} from "@/components/ads/entity-form-modal";
import type { ChildListItem } from "@/lib/children-types";
import {
  COUNTRY_OPTIONS,
  CUSTOM_EVENTS,
  ENTITY_STATUSES,
  OPTIMIZATION_GOALS,
  defaultOptimizationGoal,
  fromMetaMinorUnits,
  needsConversionPixel,
  type BudgetType,
} from "@/lib/meta-ads-options";

type PixelOption = {
  id: string;
  name: string;
};

type AdSetFormProps = {
  open: boolean;
  campaignId: string;
  accountId?: string;
  currency?: string | null;
  objective?: string | null;
  campaignHasBudget?: boolean;
  adSet?: ChildListItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export function AdSetForm({
  open,
  campaignId,
  accountId,
  currency,
  objective,
  campaignHasBudget = false,
  adSet,
  onClose,
  onSaved,
}: AdSetFormProps) {
  const editing = Boolean(adSet);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("PAUSED");
  const [budgetType, setBudgetType] = useState<BudgetType>("daily");
  const [budgetAmount, setBudgetAmount] = useState("10");
  const [optimizationGoal, setOptimizationGoal] = useState(
    defaultOptimizationGoal(objective),
  );
  const [countries, setCountries] = useState<string[]>(["TR"]);
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [startTime, setStartTime] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [customEventType, setCustomEventType] = useState("PURCHASE");
  const [pixels, setPixels] = useState<PixelOption[]>([]);
  const [replaceTargeting, setReplaceTargeting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretError, setSecretError] = useState("");

  const showPixel = needsConversionPixel(objective);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");
    setName(adSet?.name ?? "");
    setStatus(
      adSet?.effectiveStatus === "ACTIVE" || adSet?.effectiveStatus === "PAUSED"
        ? adSet.effectiveStatus
        : "PAUSED",
    );
    setBudgetType(
      adSet?.dailyBudget
        ? "daily"
        : adSet?.lifetimeBudget
          ? "lifetime"
          : adSet && campaignHasBudget
            ? "none"
            : "daily",
    );
    setBudgetAmount(
      fromMetaMinorUnits(adSet?.dailyBudget ?? adSet?.lifetimeBudget ?? "1000", currency) ||
        "10",
    );
    setOptimizationGoal(adSet?.extra || defaultOptimizationGoal(objective));
    setCountries(["TR"]);
    setAgeMin("18");
    setAgeMax("65");
    setStartTime(
      adSet?.startTime ? adSet.startTime.slice(0, 16) : "",
    );
    setPixelId("");
    setCustomEventType("PURCHASE");
    setReplaceTargeting(!adSet);

    if (!accountId) {
      return;
    }

    let cancelled = false;

    async function loadAssets() {
      const response = await fetch(`/api/meta/assets?accountId=${accountId}`, {
        credentials: "include",
      });
      const data = (await response.json().catch(() => null)) as {
        pixels?: PixelOption[];
      } | null;

      if (cancelled) {
        return;
      }

      setPixels(data?.pixels ?? []);
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [accountId, adSet, campaignHasBudget, currency, objective, open]);

  function toggleCountry(code: string) {
    setCountries((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  const needsCloseSecret = true;

  async function save(closePassword?: string) {
    setSaving(true);
    setError("");
    setSecretError("");

    if (needsCloseSecret && !closePassword) {
      setSaving(false);
      setSecretOpen(true);
      return;
    }

    if ((!editing || replaceTargeting) && countries.length === 0) {
      setSaving(false);
      setError("En az bir ülke seçin.");
      return;
    }

    const payload = {
      ...(editing ? {} : { campaignId }),
      name,
      status,
      closePassword,
      ...(campaignHasBudget || (editing && budgetType === "none")
        ? {}
        : {
            budgetType,
            budgetAmount: Number(budgetAmount),
          }),
      optimizationGoal,
      ...(!editing || replaceTargeting
        ? {
            countries,
            ageMin: Number(ageMin),
            ageMax: Number(ageMax),
          }
        : {}),
      startTime: startTime || undefined,
      pixelId: pixelId || undefined,
      customEventType: pixelId ? customEventType : undefined,
    };

    const response = await fetch(
      editing ? `/api/adsets/${adSet?.id}` : "/api/adsets",
      {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setSaving(false);

    if (!response.ok) {
      const message = data?.error ?? "Reklam seti kaydedilemedi.";
      if (needsCloseSecret) {
        setSecretOpen(true);
        setSecretError(message);
        return;
      }
      setError(message);
      return;
    }

    setSecretOpen(false);

    onSaved(
      editing
        ? `"${name}" reklam seti güncellendi.`
        : `"${name}" reklam seti oluşturuldu.`,
    );
    onClose();
  }

  return (
    <EntityFormModal
      open={open}
      title={editing ? "Reklam setini düzenle" : "Yeni reklam seti"}
      description="Hedefleme, bütçe ve optimizasyon Ads Manager ile aynı hiyerarşide."
      onClose={onClose}
    >
      <CloseSecretDialog
        open={secretOpen}
        title={
          editing
            ? `“${name || "Reklam seti"}” güncellenecek`
            : "Yeni reklam seti oluşturulacak"
        }
        confirmLabel={editing ? "Güncelle" : "Oluştur"}
        submitting={saving}
        error={secretError}
        onCancel={() => {
          setSecretOpen(false);
          setSecretError("");
        }}
        onConfirm={(password) => void save(password)}
      />
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <Field label="Reklam seti adı">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClassName}
            placeholder="Örn. TR 18-45 — dönüşüm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Optimizasyon">
            <select
              value={optimizationGoal}
              onChange={(event) => setOptimizationGoal(event.target.value)}
              className={fieldClassName}
            >
              {OPTIMIZATION_GOALS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Durum">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "ACTIVE" | "PAUSED")
              }
              className={fieldClassName}
            >
              {ENTITY_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {campaignHasBudget ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Bu kampanyada Advantage Campaign Budget açık. Bütçe kampanya
            seviyesinden yönetilir.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bütçe türü">
              <select
                value={budgetType}
                onChange={(event) =>
                  setBudgetType(event.target.value as BudgetType)
                }
                className={fieldClassName}
              >
                <option value="daily">Günlük</option>
                <option value="lifetime">Toplam</option>
              </select>
            </Field>
            <Field label={`Bütçe${currency ? ` (${currency})` : ""}`}>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
                className={fieldClassName}
              />
            </Field>
          </div>
        )}

        {editing ? (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={replaceTargeting}
              onChange={(event) => setReplaceTargeting(event.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            Ülke ve yaş hedeflemesini de güncelle
          </label>
        ) : null}

        {!editing || replaceTargeting ? (
          <>
            <Field label="Ülkeler">
              <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-3">
                {COUNTRY_OPTIONS.map((country) => (
                  <label
                    key={country.value}
                    className="inline-flex items-center gap-2 text-sm font-normal text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={countries.includes(country.value)}
                      onChange={() => toggleCountry(country.value)}
                      className="h-4 w-4 rounded border-line"
                    />
                    {country.label}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Min. yaş">
                <input
                  type="number"
                  min="13"
                  max="65"
                  value={ageMin}
                  onChange={(event) => setAgeMin(event.target.value)}
                  className={fieldClassName}
                />
              </Field>
              <Field label="Maks. yaş">
                <input
                  type="number"
                  min="13"
                  max="65"
                  value={ageMax}
                  onChange={(event) => setAgeMax(event.target.value)}
                  className={fieldClassName}
                />
              </Field>
            </div>
          </>
        ) : null}

        <Field label="Başlangıç (isteğe bağlı)">
          <input
            type="datetime-local"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className={fieldClassName}
          />
        </Field>

        {showPixel ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Piksel"
              hint="Satış / lead hedeflerinde dönüşüm için önerilir."
            >
              <select
                value={pixelId}
                onChange={(event) => setPixelId(event.target.value)}
                className={fieldClassName}
              >
                <option value="">Piksel seçilmedi</option>
                {pixels.map((pixel) => (
                  <option key={pixel.id} value={pixel.id}>
                    {pixel.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dönüşüm olayı">
              <select
                value={customEventType}
                onChange={(event) => setCustomEventType(event.target.value)}
                className={fieldClassName}
                disabled={!pixelId}
              >
                {CUSTOM_EVENTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {saving
              ? "Kaydediliyor..."
              : editing
                ? "Reklam setini güncelle"
                : "Reklam setini oluştur"}
          </button>
        </div>
      </form>
    </EntityFormModal>
  );
}
