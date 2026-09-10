"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  Shield,
  Unplug,
} from "lucide-react";
import { CloseSecretDialog } from "@/components/ads/close-secret-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/format";
import { accountStatusLabel, isAccountHealthy } from "@/lib/meta-labels";

type MetaSettingsProps = {
  redirectUri: string;
  connected: boolean;
  error?: string;
  config: {
    appId: string;
    graphVersion: string;
    updatedAt: string;
  } | null;
  connection: {
    metaUserName: string | null;
    metaUserId: string;
    status: "DISCONNECTED" | "CONNECTED" | "EXPIRED" | "ERROR";
    tokenExpiresAt: string | null;
    lastSyncedAt: string | null;
    errorMessage: string | null;
    tokenMasked: string;
    accounts: Array<{
      id: string;
      metaAccountId: string;
      name: string;
      businessName: string | null;
      currency: string | null;
      timezoneName: string | null;
      accountStatus: number | null;
      amountSpent: string | null;
    }>;
  } | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  config: "Önce App ID ve App Secret kaydedin.",
  "oauth-state": "Güvenlik doğrulaması başarısız. Tekrar bağlanmayı deneyin.",
};

function connectionTone(
  status?: "DISCONNECTED" | "CONNECTED" | "EXPIRED" | "ERROR",
) {
  switch (status) {
    case "CONNECTED":
      return "success" as const;
    case "EXPIRED":
      return "warning" as const;
    case "ERROR":
      return "danger" as const;
    case "DISCONNECTED":
    case undefined:
      return "neutral" as const;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function connectionLabel(
  status?: "DISCONNECTED" | "CONNECTED" | "EXPIRED" | "ERROR",
) {
  switch (status) {
    case "CONNECTED":
      return "Bağlı";
    case "EXPIRED":
      return "Süresi doldu";
    case "ERROR":
      return "Hata";
    case "DISCONNECTED":
      return "Kopuk";
    case undefined:
      return "Kurulmadı";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function MetaSettings({
  redirectUri,
  connected,
  error,
  config,
  connection,
}: MetaSettingsProps) {
  const router = useRouter();
  const [appId, setAppId] = useState(config?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [graphVersion, setGraphVersion] = useState(
    config?.graphVersion ?? "v22.0",
  );
  const [redirectValue, setRedirectValue] = useState(redirectUri);
  const [saving, setSaving] = useState(false);
  const [savingRedirect, setSavingRedirect] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState(
    connected ? "Meta hesabı bağlandı ve reklam hesapları içe aktarıldı." : "",
  );
  const [formError, setFormError] = useState(
    error ? (ERROR_MESSAGES[error] ?? error) : "",
  );
  const [secretKind, setSecretKind] = useState<"config" | "redirect" | null>(
    null,
  );
  const [secretError, setSecretError] = useState("");

  async function saveConfig(closePassword?: string) {
    if (!closePassword) {
      setSecretError("");
      setSecretKind("config");
      return;
    }

    setSaving(true);
    setFormError("");
    setSecretError("");
    setMessage("");

    const response = await fetch("/api/meta/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, appSecret, graphVersion, closePassword }),
    });
    const data = (await response.json()) as { error?: string };

    setSaving(false);

    if (!response.ok) {
      setSecretError(data.error ?? "Yetkiniz yok, bu işlemi yapamazsınız.");
      return;
    }

    setSecretKind(null);
    setAppSecret("");
    setMessage("Meta uygulama bilgileri kaydedildi. Şimdi hesabı bağlayabilirsiniz.");
    router.refresh();
  }

  async function saveRedirect(closePassword?: string) {
    if (!closePassword) {
      setSecretError("");
      setSecretKind("redirect");
      return;
    }

    setSavingRedirect(true);
    setFormError("");
    setSecretError("");
    setMessage("");

    const response = await fetch("/api/meta/redirect-uri", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirectUri: redirectValue, closePassword }),
    });
    const data = (await response.json()) as {
      error?: string;
      redirectUri?: string;
    };

    setSavingRedirect(false);

    if (!response.ok) {
      setSecretError(data.error ?? "Yetkiniz yok, bu işlemi yapamazsınız.");
      return;
    }

    setSecretKind(null);

    if (data.redirectUri) {
      setRedirectValue(data.redirectUri);
    }

    setMessage(
      "Geri dönüş adresi kaydedildi. Aynı adresi Facebook uygulamanıza da ekleyin.",
    );
    router.refresh();
  }

  async function copyRedirect() {
    await navigator.clipboard.writeText(redirectValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function syncAccounts() {
    setSyncing(true);
    setFormError("");
    const response = await fetch("/api/meta/sync", { method: "POST" });
    const data = (await response.json()) as { error?: string; count?: number };
    setSyncing(false);

    if (!response.ok) {
      setFormError(data.error ?? "Senkronizasyon başarısız.");
      return;
    }

    setMessage(`${data.count ?? 0} reklam hesabı güncellendi.`);
    router.refresh();
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Meta bağlantısı kesilecek ve çekilen tüm hesap, kampanya, reklam ve istatistikler silinecek. Uygulama ayarları durur. Devam edilsin mi?",
      )
    ) {
      return;
    }

    setDisconnecting(true);
    setFormError("");
    setMessage("");

    const response = await fetch("/api/meta/disconnect", { method: "POST" });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setDisconnecting(false);

    if (!response.ok) {
      setFormError(data?.error ?? "Bağlantı kesilemedi.");
      return;
    }

    setMessage(
      "Meta bağlantısı kesildi. Çekilen hesap ve istatistikler silindi. Uygulama ayarları duruyor.",
    );
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {(message || formError) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            formError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {formError || message}
        </div>
      )}

      <CloseSecretDialog
        open={secretKind !== null}
        title={
          secretKind === "redirect"
            ? "OAuth yönlendirme adresi kaydedilecek"
            : "Meta uygulama köprüsü kaydedilecek"
        }
        confirmLabel="Kaydet"
        submitting={saving || savingRedirect}
        error={secretError}
        onCancel={() => {
          setSecretKind(null);
          setSecretError("");
        }}
        onConfirm={(password) => {
          if (secretKind === "redirect") {
            void saveRedirect(password);
            return;
          }
          void saveConfig(password);
        }}
      />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_30px_rgba(16,32,51,0.04)] lg:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-accent">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Meta uygulama köprüsü</h2>
              <p className="text-sm text-slate-500">
                Facebook Developer uygulamanızın kimlik bilgileri
              </p>
            </div>
          </div>

          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void saveConfig();
            }}
            className="grid gap-4 md:grid-cols-2"
          >
            <label className="text-sm font-medium text-slate-700">
              App ID
              <input
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 transition focus:ring-4"
                placeholder="123456789012345"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              App Secret
              <input
                type="password"
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 transition focus:ring-4"
                placeholder={config ? "Yeni secret girin" : "Uygulama gizli anahtarı"}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Graph API sürümü
              <input
                value={graphVersion}
                onChange={(event) => setGraphVersion(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 outline-none ring-accent/30 transition focus:ring-4"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Kaydediliyor..." : "Kimlik bilgilerini kaydet"}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
          <p className="text-sm font-medium">Kurulum adımları</p>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li>1. developers.facebook.com üzerinde bir uygulama oluşturun.</li>
            <li>2. Marketing API ve Facebook Login ürünlerini ekleyin.</li>
            <li>3. ngrok ile paneli dışarı açın ve yönlendirme adresini kaydedin.</li>
            <li>4. Aynı tam adresi Facebook Valid OAuth Redirect URI alanına ekleyin.</li>
            <li>5. App ID / Secret kaydedip Meta ile bağlanın.</li>
          </ol>
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-strong"
          >
            Meta Developer Console
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">OAuth yönlendirme adresi</h2>
            <p className="mt-1 text-sm text-slate-500">
              Facebook localhost kabul etmez. ngrok adresinizi yazın; kök
              adresi yeterli, geri dönüş yolu otomatik eklenir. Aynı tam
              adresi Facebook Login ayarlarına da yapıştırın.
            </p>
            <form
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void saveRedirect();
              }}
              className="mt-4 flex flex-col gap-3"
            >
              <input
                value={redirectValue}
                onChange={(event) => setRedirectValue(event.target.value)}
                required
                className="w-full rounded-xl border border-line px-3 py-2.5 font-mono text-sm outline-none ring-accent/30 transition focus:ring-4"
                placeholder="https://xxxx.ngrok-free.app"
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={savingRedirect}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingRedirect ? "Kaydediliyor..." : "Adresi kaydet"}
                </button>
                <button
                  type="button"
                  onClick={copyRedirect}
                  className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Kopyalandı" : "Kopyala"}
                </button>
              </div>
            </form>
          </div>
          <StatusBadge tone={config ? "success" : "warning"}>
            {config ? "Uygulama kayıtlı" : "Uygulama bekleniyor"}
          </StatusBadge>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6 shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-accent">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Business Suite bağlantısı</h2>
              <p className="text-sm text-slate-500">
                Reklam hesaplarını okumak için Meta oturumunu yetkilendirin
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/meta/oauth/start"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
            >
              <CheckCircle2 className="h-4 w-4" />
              Meta ile bağlan
            </a>
            <button
              type="button"
              onClick={syncAccounts}
              disabled={!connection || syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Hesapları yenile
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={!connection || disconnecting}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <Unplug className="h-4 w-4" />
              Bağlantıyı kes
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Info
            label="Durum"
            value={
              <StatusBadge tone={connectionTone(connection?.status)}>
                {connectionLabel(connection?.status)}
              </StatusBadge>
            }
          />
          <Info label="Meta kullanıcısı" value={connection?.metaUserName ?? "—"} />
          <Info
            label="Token bitiş"
            value={formatDateTime(connection?.tokenExpiresAt)}
          />
          <Info
            label="Son senkron"
            value={formatDateTime(connection?.lastSyncedAt)}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card shadow-[0_10px_30px_rgba(16,32,51,0.04)]">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-semibold">İçe aktarılan reklam hesapları</h2>
          <p className="mt-1 text-sm text-slate-500">
            Bağlantı kurulunca hesaplar otomatik olarak MySQL veritabanına yazılır
          </p>
        </div>
        {!connection || connection.accounts.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            Henüz içe aktarılmış hesap yok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Hesap</th>
                  <th className="px-6 py-3 font-medium">Business</th>
                  <th className="px-6 py-3 font-medium">Saat dilimi</th>
                  <th className="px-6 py-3 font-medium">Para birimi</th>
                  <th className="px-6 py-3 font-medium">Durum</th>
                  <th className="px-6 py-3 font-medium">Harcama</th>
                </tr>
              </thead>
              <tbody>
                {connection.accounts.map((account) => (
                  <tr key={account.id} className="border-t border-line">
                    <td className="px-6 py-3">
                      <p className="font-medium">{account.name}</p>
                      <p className="text-xs text-slate-400">
                        {account.metaAccountId}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {account.businessName ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {account.timezoneName ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {account.currency ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge
                        tone={
                          isAccountHealthy(account.accountStatus)
                            ? "success"
                            : "warning"
                        }
                      >
                        {accountStatusLabel(account.accountStatus)}
                      </StatusBadge>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {account.amountSpent ?? "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdLibraryAccessCard />
    </div>
  );
}

function AdLibraryAccessCard() {
  const [note, setNote] = useState("Kütüphane erişimi kontrol ediliyor…");
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch("/api/meta/ad-library/status", { credentials: "include" })
      .then(async (response) => {
        const data = (await response.json()) as {
          ready?: boolean;
          note?: string;
        };
        setReady(Boolean(data.ready));
        setNote(data.note ?? "Durum alınamadı.");
      })
      .catch(() => {
        setReady(false);
        setNote("Durum kontrolü yapılamadı.");
      });
  }, []);

  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <h3 className="font-semibold">Meta Reklam Kütüphanesi</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Rakip reklam taraması resmi{" "}
        <a
          href="https://www.facebook.com/ads/library/api/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          ads_archive
        </a>{" "}
        API’sini kullanır. App Review yetmez; bağlanan kullanıcının{" "}
        <a
          href="https://www.facebook.com/ID"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          facebook.com/ID
        </a>{" "}
        kimlik doğrulaması gerekir. Ticari reklamlar AB/İngiltere teslimatında
        arşivlenir.
      </p>
      <div className="mt-4">
        <StatusBadge
          tone={
            ready === null ? "neutral" : ready ? "success" : "warning"
          }
        >
          {ready === null ? "Kontrol" : ready ? "API hazır" : "API kapalı"}
        </StatusBadge>
        <p className="mt-2 text-sm text-slate-600">{note}</p>
      </div>
    </section>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
