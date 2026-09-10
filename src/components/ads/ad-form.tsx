"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CloseSecretDialog } from "@/components/ads/close-secret-dialog";
import {
  EntityFormModal,
  Field,
  fieldClassName,
} from "@/components/ads/entity-form-modal";
import type { ChildListItem } from "@/lib/children-types";
import { AD_CTAS, ENTITY_STATUSES } from "@/lib/meta-ads-options";

type PageOption = {
  id: string;
  name: string;
};

type AdFormProps = {
  open: boolean;
  adSetId: string;
  accountId?: string;
  ad?: ChildListItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export function AdForm({
  open,
  adSetId,
  accountId,
  ad,
  onClose,
  onSaved,
}: AdFormProps) {
  const editing = Boolean(ad);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("PAUSED");
  const [pageId, setPageId] = useState("");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [cta, setCta] = useState("LEARN_MORE");
  const [pages, setPages] = useState<PageOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretError, setSecretError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");
    setName(ad?.name ?? "");
    setStatus(
      ad?.effectiveStatus === "ACTIVE" || ad?.effectiveStatus === "PAUSED"
        ? ad.effectiveStatus
        : "PAUSED",
    );
    setPageId("");
    setMessage("");
    setHeadline(ad?.extra ?? "");
    setDescription("");
    setLink("");
    setImageUrl(ad?.thumbnailUrl ?? "");
    setCta("LEARN_MORE");

    if (ad?.extra) {
      setHeadline(ad.extra);
    }

    if (!accountId) {
      return;
    }

    let cancelled = false;

    async function loadAssets() {
      const response = await fetch(`/api/meta/assets?accountId=${accountId}`, {
        credentials: "include",
      });
      const data = (await response.json().catch(() => null)) as {
        pages?: PageOption[];
      } | null;

      if (cancelled) {
        return;
      }

      const nextPages = data?.pages ?? [];
      setPages(nextPages);
      setPageId((current) => current || nextPages[0]?.id || "");
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [accountId, ad, open]);

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

    if (!editing && (!pageId || !message.trim() || !link.trim())) {
      setSaving(false);
      setError("Sayfa, birincil metin ve hedef bağlantı gerekli.");
      return;
    }

    const hasCreative = Boolean(pageId && message.trim() && link.trim());
    const payload = {
      ...(editing ? {} : { adSetId }),
      name,
      status,
      closePassword,
      ...(hasCreative
        ? {
            pageId,
            message: message.trim(),
            headline: headline.trim() || undefined,
            description: description.trim() || undefined,
            link: link.trim(),
            imageUrl: imageUrl.trim() || undefined,
            cta,
          }
        : {}),
    };

    const response = await fetch(editing ? `/api/ads/${ad?.id}` : "/api/ads", {
      method: editing ? "PATCH" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setSaving(false);

    if (!response.ok) {
      const messageText = data?.error ?? "Reklam kaydedilemedi.";
      if (needsCloseSecret) {
        setSecretOpen(true);
        setSecretError(messageText);
        return;
      }
      setError(messageText);
      return;
    }

    setSecretOpen(false);

    onSaved(
      editing ? `"${name}" reklamı güncellendi.` : `"${name}" reklamı oluşturuldu.`,
    );
    onClose();
  }

  return (
    <EntityFormModal
      open={open}
      title={editing ? "Reklamı düzenle" : "Yeni reklam"}
      description="Sayfa, metin, görsel bağlantısı ve CTA — tek görseller için link reklamı."
      onClose={onClose}
    >
      <CloseSecretDialog
        open={secretOpen}
        title={
          editing
            ? `“${name || "Reklam"}” güncellenecek`
            : "Yeni reklam oluşturulacak"
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
        <Field label="Reklam adı">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClassName}
            placeholder="Örn. Yaz koleksiyonu — görsel 1"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facebook sayfası">
            <select
              required={!editing}
              value={pageId}
              onChange={(event) => setPageId(event.target.value)}
              className={fieldClassName}
            >
              <option value="">Sayfa seçin</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
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

        <Field label="Birincil metin">
          <textarea
            required={!editing}
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className={fieldClassName}
            placeholder="Reklamın ana metni"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlık">
            <input
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              className={fieldClassName}
              maxLength={255}
            />
          </Field>
          <Field label="Açıklama">
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={fieldClassName}
              maxLength={500}
            />
          </Field>
        </div>

        <Field
          label="Hedef URL"
          hint={
            editing
              ? "Kreatifi değiştirmek için sayfa, metin ve URL doldurun. Sadece ad/durum için boş bırakabilirsiniz."
              : "Görsel herkese açık bir HTTPS adresi olmalı."
          }
        >
          <input
            required={!editing}
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            className={fieldClassName}
            placeholder="https://ornek.com/urun"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Görsel URL">
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              className={fieldClassName}
              placeholder="https://..."
            />
          </Field>
          <Field label="Harekete geçir butonu">
            <select
              value={cta}
              onChange={(event) => setCta(event.target.value)}
              className={fieldClassName}
            >
              {AD_CTAS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

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
                ? "Reklamı güncelle"
                : "Reklamı oluştur"}
          </button>
        </div>
      </form>
    </EntityFormModal>
  );
}
