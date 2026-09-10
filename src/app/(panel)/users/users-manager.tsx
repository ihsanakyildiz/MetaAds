"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/format";
import {
  roleDescription,
  roleLabel,
  type Role,
} from "@/lib/permissions";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | string | null;
  createdAt: Date | string;
};

const ROLES: Role[] = ["ADMIN", "ANALYST", "ADVERTISER"];

export function UsersManager({
  currentUserId,
  users,
}: {
  currentUserId: string;
  users: UserRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("ANALYST");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = (await response.json()) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? "Kullanıcı oluşturulamadı.");
      return;
    }

    setName("");
    setEmail("");
    setPassword("");
    setRole("ANALYST");
    router.refresh();
  }

  async function patchUser(id: string, body: { role?: Role; isActive?: boolean }) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[340px_1fr]">
      <form
        onSubmit={createUser}
        className="h-fit rounded-2xl border border-line bg-card p-6 shadow-[0_10px_30px_rgba(16,32,51,0.04)]"
      >
        <h2 className="font-semibold">Yeni kullanıcı</h2>
        <p className="mt-1 text-sm text-slate-500">
          Rol, panelde görünen menüleri ve işlem haklarını belirler
        </p>
        <label className="mt-5 block text-sm font-medium">
          Ad soyad
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          E-posta
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Şifre
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Rol
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 focus:ring-4"
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)} — {roleDescription(item)}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Ekleniyor..." : "Kullanıcı oluştur"}
        </button>
      </form>

      <div className="rounded-2xl border border-line bg-card shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Kullanıcı</th>
                <th className="px-6 py-3 font-medium">Rol</th>
                <th className="px-6 py-3 font-medium">Durum</th>
                <th className="px-6 py-3 font-medium">Son giriş</th>
                <th className="px-6 py-3 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line">
                  <td className="px-6 py-3">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={user.role}
                      onChange={(event) =>
                        patchUser(user.id, {
                          role: event.target.value as Role,
                        })
                      }
                      className="rounded-lg border border-line px-2 py-1.5 text-sm"
                    >
                      {ROLES.map((item) => (
                        <option key={item} value={item}>
                          {roleLabel(item)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge tone={user.isActive ? "success" : "neutral"}>
                      {user.isActive ? "Aktif" : "Pasif"}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDateTime(user.lastLoginAt)}
                  </td>
                  <td className="px-6 py-3">
                    <button
                      type="button"
                      disabled={user.id === currentUserId}
                      onClick={() =>
                        patchUser(user.id, { isActive: !user.isActive })
                      }
                      className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
                    >
                      {user.isActive ? "Pasifleştir" : "Aktifleştir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
