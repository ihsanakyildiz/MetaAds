"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { ProductIdChips } from "@/components/ads/product-id-chips";
import { formatDate, formatNumber } from "@/lib/format";

type DayProductsModalProps = {
  open: boolean;
  onClose: () => void;
  date: string;
  weekday: string;
  purchases: number;
  scope: "campaign" | "adset";
  parentId: string;
  currency?: string | null;
};

export function DayProductsModal({
  open,
  onClose,
  date,
  weekday,
  purchases,
  scope,
  parentId,
  currency,
}: DayProductsModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-slate-950/40"
        onClick={onClose}
      />
      <div className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(16,32,51,0.22)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
              O gün satan ürünler
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              {formatDate(date)}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {weekday} · {formatNumber(purchases)} adet satış
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-5">
          <p className="text-xs text-slate-500">
            Bir ürün ID’sinin üzerine gelince adı, ülke pasta dilimi ve alıcı
            cinsiyeti görünür.
          </p>
          <ProductIdChips
            currency={currency}
            scope={scope}
            parentId={parentId}
            since={date}
            until={date}
          />
        </div>
      </div>
    </div>
  );
}
