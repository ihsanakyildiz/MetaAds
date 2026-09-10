import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { childStats, queryAdSets } from "@/lib/children";
import type { DateRangePreset } from "@/lib/date-range";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { createMetaAdSet } from "@/lib/meta-ads-write";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  campaignId: z.string().min(1),
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
    return NextResponse.json({ error: "Kampanya seçilmedi." }, { status: 400 });
  }

  try {
    const { items, analysis, products, alerts } = await queryAdSets(parsed.data.campaignId, {
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
      alerts,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam setleri yüklenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

const createSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().trim().min(1).max(400),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  budgetType: z.enum(["none", "daily", "lifetime"]).default("daily"),
  budgetAmount: z.coerce.number().positive().optional(),
  optimizationGoal: z.string().optional(),
  countries: z.array(z.string().length(2)).min(1),
  ageMin: z.coerce.number().int().min(13).max(65).default(18),
  ageMax: z.coerce.number().int().min(13).max(65).default(65),
  startTime: z.string().optional(),
  pixelId: z.string().optional(),
  customEventType: z.string().optional(),
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
      { error: "Reklam seti bilgileri eksik veya geçersiz." },
      { status: 400 },
    );
  }

  if (parsed.data.ageMin > parsed.data.ageMax) {
    return NextResponse.json(
      { error: "Minimum yaş, maksimum yaştan büyük olamaz." },
      { status: 400 },
    );
  }

  const { closePassword, ...input } = parsed.data;
  const denied = await rejectIfInvalidCloseSecret(closePassword);

  if (denied) {
    return denied;
  }

  try {
    const adSet = await createMetaAdSet(input);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.adset.create",
        entity: "meta_ad_set",
        details: `${adSet.name} (${adSet.metaAdSetId})`,
      },
    });

    return NextResponse.json({ ok: true, adSet });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam seti oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
