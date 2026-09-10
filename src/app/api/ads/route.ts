import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { childStats, queryAds } from "@/lib/children";
import type { DateRangePreset } from "@/lib/date-range";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { createMetaAd } from "@/lib/meta-ads-write";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  adSetId: z.string().min(1),
  q: z.string().optional(),
  status: z.string().optional(),
  datePreset: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_VIEW);

  if (auth.response) {
    return auth.response;
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reklam seti seçilmedi." },
      { status: 400 },
    );
  }

  try {
    const { items, analysis, products } = await queryAds(parsed.data.adSetId, {
      query: parsed.data.q,
      status: parsed.data.status,
      datePreset: parsed.data.datePreset as DateRangePreset | undefined,
      since: parsed.data.since,
      until: parsed.data.until,
    });

    return NextResponse.json({
      items,
      stats: childStats(items, analysis),
      products,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklamlar yüklenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

const createSchema = z.object({
  adSetId: z.string().min(1),
  name: z.string().trim().min(1).max(400),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  pageId: z.string().min(1),
  message: z.string().trim().min(1).max(2000),
  headline: z.string().trim().max(255).optional(),
  description: z.string().trim().max(500).optional(),
  link: z.string().url(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  cta: z.string().min(1),
  closePassword: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_MANAGE);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reklam bilgileri eksik veya geçersiz." },
      { status: 400 },
    );
  }

  const denied = await rejectIfInvalidCloseSecret(parsed.data.closePassword);

  if (denied) {
    return denied;
  }

  try {
    const ad = await createMetaAd({
      adSetId: parsed.data.adSetId,
      name: parsed.data.name,
      status: parsed.data.status,
      creative: {
        pageId: parsed.data.pageId,
        message: parsed.data.message,
        headline: parsed.data.headline,
        description: parsed.data.description,
        link: parsed.data.link,
        imageUrl: parsed.data.imageUrl || undefined,
        cta: parsed.data.cta,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.ad.create",
        entity: "meta_ad",
        details: `${ad.name} (${ad.metaAdId})`,
      },
    });

    return NextResponse.json({ ok: true, ad });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
