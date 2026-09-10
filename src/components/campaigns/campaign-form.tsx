"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CloseSecretDialog } from "@/components/ads/close-secret-dialog";
import {
  EntityFormModal,
  Field,
  fieldClassName,
} from "@/components/ads/entity-form-modal";
import type { CampaignListItem } from "@/lib/campaigns";
import {
  CAMPAIGN_OBJECTIVES,
  ENTITY_STATUSES,
  SPECIAL_AD_CATEGORIES,
  fromMetaMinorUnits,
  type BudgetType,
} from "@/lib/meta-ads-options";

type AccountOption = {
  id: string;
  name: string;
  currency: string | null;
};

type CampaignFormProps = {
  open: boolean;
  accountId?: string;
  currency?: string | null;
  campaign?: CampaignListItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export function CampaignForm({
  open,
  accountId,
  currency,
  campaign,
  onClose,
  onSaved,
}: CampaignFormProps) {
  const editing = Boolean(campaign);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accountId ?? "");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_SALES");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("PAUSED");
  const [specialAdCategory, setSpecialAdCategory] = useState("NONE");
  const [budgetType, setBudgetType] = useState<BudgetType>("daily");
  const [budgetAmount, setBudgetAmount] = useState("20");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretError, setSecretError] = useState("");

  const selectedCurrency =
    currency ??
    accounts.find((account) => account.id === selectedAccountId)?.currency ??
    campaign?.currency ??
    null;

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");
    setSelectedAccountId(accountId ?? campaign?.accountId ?? "");
    setName(campaign?.name ?? "");
    setObjective(campaign?.objective ?? "OUTCOME_SALES");
    setStatus(
      campaign?.effectiveStatus === "ACTIVE" || campaign?.effectiveStatus === "PAUSED"
        ? campaign.effectiveStatus
        : "PAUSED",
    );
    setSpecialAdCategory("NONE");
    setBudgetType(
      campaign?.dailyBudget
        ? "daily"
        : campaign?.lifetimeBudget
          ? "lifetime"
          : campaign
            ? "none"
            : "daily",
    );
    setBudgetAmount(
      fromMetaMinorUnits(
        campaign?.dailyBudget ?? campaign?.lifetimeBudget ?? "2000",
        campaign?.currency ?? currency,
      ) || "20",
    );

    if (accountId) {
      return;
    }

    let cancelled = false;

    async function loadAccounts() {
      const response = await fetch("/api/meta/assets", {
        credentials: "include",
      });
      const data = (await response.json().catch(() => null)) as {
        accounts?: AccountOption[];
      } | null;

      if (cancelled) {
        return;
      }

      setAccounts(data?.accounts ?? []);
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [accountId, campaign, currency, open]);

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

    const targetAccountId = accountId ?? selectedAccountId;
    const amount = Number(budgetAmount);

    if (!targetAccountId && !editing) {
      setSaving(false);
      setError("Reklam hesabı seçin.");
      return;
    }

    const payload = {
      ...(editing ? {} : { accountId: targetAccountId, objective, specialAdCategory }),
      name,
      status,
      closePassword,
      ...(budgetType === "none"
        ? {}
        : { budgetType, budgetAmount: amount }),
    };

    const response = await fetch(
      editing ? `/api/campaigns/${campaign?.id}` : "/api/campaigns",
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
      const message = data?.error ?? "Kampanya kaydedilemedi.";
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
        ? `"${name}" kampanyası güncellendi.`
        : `"${name}" kampanyası oluşturuldu. Varsayılan durum: ${status === "PAUSED" ? "duraklatıldı" : "aktif"}.`,
    );
    onClose();
  }

  return (
    <EntityFormModal
      open={open}
      title={editing ? "Kampanyayı düzenle" : "Yeni kampanya"}
      description="Meta Ads Manager’daki gibi ad, hedef, durum ve bütçe."
      onClose={onClose}
    >
      <CloseSecretDialog
        open={secretOpen}
        title={
          editing
            ? `“${name || "Kampanya"}” güncellenecek`
            : "Yeni kampanya oluşturulacak"
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
        {!accountId && !editing ? (
          <Field label="Reklam hesabı">
            <select
              required
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className={fieldClassName}
            >
              <option value="">Hesap seçin</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Kampanya adı">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClassName}
            placeholder="Örn. Yaz indirimi — satış"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Hedef"
            hint={editing ? "Hedef, oluşturulduktan sonra değiştirilemez." : undefined}
          >
            <select
              value={objective}
              disabled={editing}
              onChange={(event) => setObjective(event.target.value)}
              className={fieldClassName}
            >
              {CAMPAIGN_OBJECTIVES.map((item) => (
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

        {!editing ? (
          <Field
            label="Özel reklam kategorisi"
            hint="Konut, kredi veya istihdam reklamları için zorunludur."
          >
            <select
              value={specialAdCategory}
              onChange={(event) => setSpecialAdCategory(event.target.value)}
              className={fieldClassName}
            >
              {SPECIAL_AD_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Bütçe türü"
            hint="Kampanya bütçesi Advantage Campaign Budget kullanır. Yoksa bütçe reklam setinde olur."
          >
            <select
              value={budgetType}
              onChange={(event) =>
                setBudgetType(event.target.value as BudgetType)
              }
              className={fieldClassName}
            >
              <option value="none">Reklam seti bütçesi</option>
              <option value="daily">Günlük kampanya bütçesi</option>
              <option value="lifetime">Toplam kampanya bütçesi</option>
            </select>
          </Field>
          {budgetType !== "none" ? (
            <Field label={`Bütçe${selectedCurrency ? ` (${selectedCurrency})` : ""}`}>
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
          ) : null}
        </div>

        {error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Yeni kampanyalar güvenli olsun diye varsayılan olarak duraklatılır.
            Hazır olunca Aktif yapabilirsiniz.
          </p>
        )}

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
                ? "Kampanyayı güncelle"
                : "Kampanyayı oluştur"}
          </button>
        </div>
      </form>
    </EntityFormModal>
  );
}
