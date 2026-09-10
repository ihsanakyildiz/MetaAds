"use client";

import { useEffect, useState, type FormEvent } from "react";

type CloseSecretDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  submitting?: boolean;
  confirmLabel?: string;
  error?: string;
  onCancel: () => void;
  onConfirm: (password: string) => void;
};

export function CloseSecretDialog({
  open,
  title,
  description,
  submitting = false,
  confirmLabel = "Onayla",
  error,
  onCancel,
  onConfirm,
}: CloseSecretDialogProps) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setPassword("");
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(password);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-[0_24px_80px_rgba(16,32,51,0.2)]"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {description ??
            "Bu işlem için onay şifresini girin. Şifreyi bilmiyorsanız devam edemezsiniz."}
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Kapatma şifresi
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
            autoComplete="current-password"
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting || !password}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {submitting ? "Kontrol ediliyor..." : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
