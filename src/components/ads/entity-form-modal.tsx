"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type EntityFormModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function EntityFormModal({
  open,
  title,
  description,
  onClose,
  children,
}: EntityFormModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-card shadow-[0_24px_80px_rgba(16,32,51,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1.5 text-xs font-normal text-slate-500">{hint}</p> : null}
    </label>
  );
}

export const fieldClassName =
  "w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4";
