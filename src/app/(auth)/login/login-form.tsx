"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setError(data?.error ?? "Giriş yapılamadı.");
      setLoading(false);
      return;
    }

    router.push(searchParams.get("next") || "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-3xl border border-line bg-card p-6 shadow-[0_20px_60px_rgba(16,32,51,0.06)]"
    >
      <label className="block text-sm font-medium text-slate-700">
        E-posta
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 transition focus:ring-4"
          placeholder="admin@metaads.local"
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Şifre
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 transition focus:ring-4"
          placeholder="••••••••"
        />
      </label>
      {error ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
      >
        {loading ? "Giriş yapılıyor..." : "Panele gir"}
      </button>
    </form>
  );
}
