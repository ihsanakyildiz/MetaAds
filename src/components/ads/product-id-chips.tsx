"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SalesPieChart } from "@/components/ads/sales-pie-chart";
import { formatMoney, formatNumber } from "@/lib/format";
import type { SalesProduct, SalesSlice } from "@/lib/sales-types";

type ProductIdChipsProps = {
  products?: SalesProduct[];
  currency?: string | null;
  scope: "campaign" | "adset";
  parentId: string;
  since: string;
  until: string;
};

function displayId(product: SalesProduct) {
  return product.retailerId || product.productId;
}

function GenderBars({ slices }: { slices: SalesSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.purchases, 0);

  if (total === 0) {
    return <p className="text-xs text-slate-400">Cinsiyet verisi yok.</p>;
  }

  return (
    <ul className="space-y-2">
      {slices.map((slice) => (
        <li key={slice.key}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">{slice.label}</span>
            <span className="font-semibold text-slate-800">
              {formatNumber(slice.purchases)} kişi
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(4, (slice.purchases / total) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProductHoverCard({
  product,
  currency,
}: {
  product: SalesProduct;
  currency?: string | null;
}) {
  const roas = product.spend > 0 ? product.purchaseValue / product.spend : 0;
  const cpa = product.purchases > 0 ? product.spend / product.purchases : 0;

  return (
    <div className="w-[380px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_rgba(16,32,51,0.18)]">
      <div className="flex gap-3">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="h-16 w-16 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-[10px] text-slate-400">
            Görsel yok
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-slate-900">
            {product.name ?? "Katalog adı bulunamadı"}
          </p>
          {product.brand ? (
            <p className="mt-0.5 text-xs text-slate-500">{product.brand}</p>
          ) : null}
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            ID {displayId(product)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Mini label="Satış" value={`${formatNumber(product.purchases)} adet`} />
        <Mini label="Ciro" value={formatMoney(product.purchaseValue, currency)} />
        <Mini label="Harcama" value={formatMoney(product.spend, currency)} />
        <Mini
          label="ROAS"
          value={roas ? `${roas.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}x` : "—"}
        />
        <Mini label="Satış başı" value={formatMoney(cpa, currency)} />
        <Mini
          label="Fiyat"
          value={product.price ?? "—"}
        />
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <SalesPieChart
          slices={product.countries}
          title={
            product.geoIsProductSpecific
              ? "Satış yapılan ülkeler"
              : "Bu dönemdeki alıcı ülkeleri"
          }
        />
        {!product.geoIsProductSpecific && product.countries.length > 0 ? (
          <p className="mt-2 text-[11px] text-slate-400">
            Meta ürün + ülke kırılımını birlikte vermediği için ülke dağılımı
            bu kampanya/reklam setinin toplam alıcılarından hesaplanır.
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-medium text-slate-500">Satın alanların cinsiyeti</p>
        <div className="mt-3">
          <GenderBars slices={product.genders} />
        </div>
      </div>

      {product.ages.length > 0 ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs font-medium text-slate-500">Yaş dağılımı</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {product.ages.map((age) => (
              <span
                key={age.key}
                className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600"
              >
                {age.label} · {formatNumber(age.purchases)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ProductChip({
  product,
  currency,
}: {
  product: SalesProduct;
  currency?: string | null;
}) {
  const chipId = useId();
  const chipRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>(0);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    placement: "below" as "above" | "below",
    maxHeight: 480,
  });

  function place() {
    const box = chipRef.current?.getBoundingClientRect();

    if (!box) {
      return;
    }

    const width = 396;
    const gap = 10;
    const margin = 12;
    const measured = cardRef.current?.offsetHeight ?? 560;
    const spaceBelow = window.innerHeight - box.bottom - margin;
    const spaceAbove = box.top - margin;
    const openAbove = measured > spaceBelow && spaceAbove > spaceBelow;
    const available = (openAbove ? spaceAbove : spaceBelow) - gap;

    setCoords({
      top: openAbove ? box.top - gap : box.bottom + gap,
      left: Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, box.left),
      ),
      placement: openAbove ? "above" : "below",
      maxHeight: Math.min(measured, Math.max(260, available)),
    });
  }

  function showCard() {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function hideCard() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    place();
    const frame = window.requestAnimationFrame(place);

    function onMove() {
      place();
    }

    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <div
      className="relative"
      onMouseEnter={showCard}
      onMouseLeave={hideCard}
    >
      <button
        ref={chipRef}
        type="button"
        aria-describedby={open ? chipId : undefined}
        className="rounded-full border border-accent/20 bg-blue-50 px-3 py-1.5 font-mono text-xs font-medium text-accent transition hover:border-accent/40 hover:bg-blue-100"
      >
        {displayId(product)}
        <span className="ml-1.5 font-sans text-slate-500">
          · {formatNumber(product.purchases)}
        </span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={chipId}
              ref={cardRef}
              role="tooltip"
              className="fixed z-[80]"
              style={{
                top: coords.top,
                left: coords.left,
                transform:
                  coords.placement === "above" ? "translateY(-100%)" : undefined,
              }}
              onMouseEnter={showCard}
              onMouseLeave={hideCard}
            >
              <div
                className="overflow-y-auto"
                style={{ maxHeight: coords.maxHeight }}
              >
                <ProductHoverCard product={product} currency={currency} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function ProductIdChips({
  products: initialProducts,
  currency,
  scope,
  parentId,
  since,
  until,
}: ProductIdChipsProps) {
  const [products, setProducts] = useState<SalesProduct[]>(initialProducts ?? []);
  const [loading, setLoading] = useState(!initialProducts?.length);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(!(initialProducts && initialProducts.length > 0));
      setError("");

      const params = new URLSearchParams({
        scope,
        id: parentId,
        since,
        until,
      });
      const response = await fetch(`/api/sales/products?${params.toString()}`, {
        credentials: "include",
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        products?: SalesProduct[];
      } | null;

      if (cancelled) {
        return;
      }

      setLoading(false);

      if (!response.ok) {
        setError(data?.error ?? "Ürün ID’leri yüklenemedi.");
        return;
      }

      setProducts(data?.products ?? []);
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [initialProducts, parentId, scope, since, until]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500">
        Satan ürünler taranıyor. Katalogdaki satış satırları toplanıyor...
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  if (products.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Bu aralıkta ürün ID’si içeren satış kırılımı bulunamadı.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {products.map((product) => (
        <ProductChip
          key={product.productId}
          product={product}
          currency={currency}
        />
      ))}
    </div>
  );
}
