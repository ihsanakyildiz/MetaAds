"use client";

import { useState, type FormEvent } from "react";
import { ShieldAlert } from "lucide-react";
import type { BudgetGuardSettingsView } from "@/lib/budget-guard-types";

type BudgetGuardSettingsProps = {
  initial: BudgetGuardSettingsView;
};

export function BudgetGuardSettings({ initial }: BudgetGuardSettingsProps) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [maxProductSales, setMaxProductSales] = useState(
    String(initial.maxProductSales),
  );
  const [maxAdSetSpend, setMaxAdSetSpend] = useState(
    String(initial.maxAdSetSpend),
  );
  const [minClicksToJudge, setMinClicksToJudge] = useState(
    String(initial.minClicksToJudge),
  );
  const [minImpressionsToJudge, setMinImpressionsToJudge] = useState(
    String(initial.minImpressionsToJudge),
  );
  const [highCtrPercent, setHighCtrPercent] = useState(
    String(initial.highCtrPercent),
  );
  const [earlyWarningRatio, setEarlyWarningRatio] = useState(
    String(Math.round(initial.earlyWarningRatio * 100)),
  );
  const [minRoasToKeep, setMinRoasToKeep] = useState(
    String(initial.minRoasToKeep),
  );
  const [firstReviewDays, setFirstReviewDays] = useState(
    String(initial.firstReviewDays),
  );
  const [hardCloseDays, setHardCloseDays] = useState(
    String(initial.hardCloseDays),
  );
  const [minSalesToKeep, setMinSalesToKeep] = useState(
    String(initial.minSalesToKeep),
  );
  const [extraSalesToConfirm, setExtraSalesToConfirm] = useState(
    String(initial.extraSalesToConfirm),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setFormError("");

    const response = await fetch("/api/settings/budget-guard", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        maxProductSales: Number(maxProductSales),
        maxAdSetSpend: Number(maxAdSetSpend),
        minClicksToJudge: Number(minClicksToJudge),
        minImpressionsToJudge: Number(minImpressionsToJudge),
        highCtrPercent: Number(highCtrPercent),
        earlyWarningRatio: Number(earlyWarningRatio) / 100,
        minRoasToKeep: Number(minRoasToKeep),
        firstReviewDays: Number(firstReviewDays),
        hardCloseDays: Number(hardCloseDays),
        extraSalesToConfirm: Number(extraSalesToConfirm),
        minSalesToKeep: Number(minSalesToKeep),
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setSaving(false);

    if (!response.ok) {
      setFormError(data?.error ?? "Bütçe koruma ayarları kaydedilemedi.");
      return;
    }

    setMessage("Bütçe koruma kuralları kaydedildi. Reklam setleri açıldığında uygulanır.");
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">Bütçe koruma</h2>
          <p className="text-sm text-slate-500">
            Küçük bütçeyle test et. Sadece kapatılması gereken setler uyarılır;
            yanındaki Kapat ile Meta’da durdurulur.
          </p>
        </div>
      </div>

      {message || formError ? (
        <div
          className={`mb-5 rounded-xl px-4 py-3 text-sm ${
            formError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {formError || message}
        </div>
      ) : null}

      <form onSubmit={(event) => void save(event)} className="space-y-6">
        <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
          <span>
            <span className="block text-sm font-medium">Kuralları çalıştır</span>
            <span className="text-xs text-slate-500">
              Kapalıyken reklam seti sayfasında uyarı üretilmez.
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 accent-slate-900"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Ürün satış tavanı (adet)"
            hint="Bir ürün bu adede ulaşınca bağlı seti kapatmanız önerilir."
            value={maxProductSales}
            onChange={setMaxProductSales}
            min={1}
            step="1"
          />
          <Field
            label="Reklam seti harcama limiti"
            hint="Set bu tutara gelip satış yapmazsa kapatın. Hesap para birimiyle girin (ör. 5)."
            value={maxAdSetSpend}
            onChange={setMaxAdSetSpend}
            min={0.01}
            step="0.01"
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold">Karar eşikleri</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Para limiti satışsız dolunca set kapatılır. Gün limiti ise satışın
            tesadüf mü yoksa devam mı ettiğini ölçer: ilk kontrolde satış varsa
            açık kalır, son karar gününe kadar ek satış gelmezse kapatılır.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Fiyat kararı için min. tıklama"
            hint="Bu tıklamanın altında 'fiyat pahalı' demek güvenli değildir."
            value={minClicksToJudge}
            onChange={setMinClicksToJudge}
            min={1}
            step="1"
          />
          <Field
            label="Fiyat kararı için min. gösterim"
            hint="Yeterli gösterim yoksa ilgi ölçümü zayıf kalır."
            value={minImpressionsToJudge}
            onChange={setMinImpressionsToJudge}
            min={1}
            step="1"
          />
          <Field
            label="Yüksek CTR eşiği (%)"
            hint="Meta CTR yüzdesidir. Üstündeyse ürün ilgisi var sayılır."
            value={highCtrPercent}
            onChange={setHighCtrPercent}
            min={0.1}
            step="0.1"
          />
          <Field
            label="Erken uyarı eşiği (%)"
            hint="Limitin bu yüzdesine gelince, satış yoksa önceden uyarır. Örn. 70 → 5 birimde 3,5."
            value={earlyWarningRatio}
            onChange={setEarlyWarningRatio}
            min={10}
            max={99}
            step="1"
          />
          <Field
            label="Minimum ROAS"
            hint="Limit doldu ve satış geldi ama ciro/harcama bunun altındaysa set kapatılır."
            value={minRoasToKeep}
            onChange={setMinRoasToKeep}
            min={0}
            step="0.1"
          />
          <Field
            label="İlk kontrol günü"
            hint="Set bu kadar gündür yayındaysa ilk karar verilir. 1 satış varsa açık kalabilir."
            value={firstReviewDays}
            onChange={setFirstReviewDays}
            min={1}
            step="1"
          />
          <Field
            label="Son karar günü"
            hint="Bu güne kadar ek satış gelmezse set kapatılır. İlk kontrolden küçük olamaz."
            value={hardCloseDays}
            onChange={setHardCloseDays}
            min={1}
            step="1"
          />
          <Field
            label="İlk kontrolde min. satış"
            hint="Bu adet satıldıysa ürünün satma olasılığı vardır, set devam eder."
            value={minSalesToKeep}
            onChange={setMinSalesToKeep}
            min={1}
            step="1"
          />
          <Field
            label="Son güne kadar ek satış"
            hint="İlk satıştan sonra bu kadar yeni satış gelmezse tesadüf sayılır ve set kapatılır."
            value={extraSalesToConfirm}
            onChange={setExtraSalesToConfirm}
            min={0}
            step="1"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Kaydediliyor..." : "Bütçe kurallarını kaydet"}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
      />
      <span className="mt-1.5 block text-xs leading-5 text-slate-500">
        {hint}
      </span>
    </label>
  );
}
