import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getBudgetGuardSettings,
  toBudgetGuardSettingsView,
} from "@/lib/budget-guard";
import { requireApiPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const settingsSchema = z.object({
  enabled: z.boolean(),
  maxProductSales: z.coerce.number().int().min(1).max(100000),
  maxAdSetSpend: z.coerce.number().positive().max(1_000_000),
  minClicksToJudge: z.coerce.number().int().min(1).max(10000),
  minImpressionsToJudge: z.coerce.number().int().min(1).max(1_000_000),
  highCtrPercent: z.coerce.number().min(0.1).max(100),
  earlyWarningRatio: z.coerce.number().min(0.1).max(0.99),
  minRoasToKeep: z.coerce.number().min(0).max(100),
  firstReviewDays: z.coerce.number().int().min(1).max(60),
  hardCloseDays: z.coerce.number().int().min(1).max(90),
  minSalesToKeep: z.coerce.number().int().min(1).max(1000),
  extraSalesToConfirm: z.coerce.number().int().min(0).max(1000),
}).refine((data) => data.hardCloseDays >= data.firstReviewDays, {
  message: "Son karar günü, ilk kontrol gününden küçük olamaz.",
  path: ["hardCloseDays"],
});

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_VIEW);

  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({
    settings: await getBudgetGuardSettings(),
  });
}

export async function PUT(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz ayarlar." },
      { status: 400 },
    );
  }

  const existing = await prisma.budgetGuardSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  const row = existing
    ? await prisma.budgetGuardSettings.update({
        where: { id: existing.id },
        data: parsed.data,
      })
    : await prisma.budgetGuardSettings.create({ data: parsed.data });

  await prisma.auditLog.create({
    data: {
      userId: auth.user.id,
      action: "budget-guard.settings.save",
      entity: "budget_guard_settings",
      details: JSON.stringify({
        maxAdSetSpend: parsed.data.maxAdSetSpend,
        maxProductSales: parsed.data.maxProductSales,
        enabled: parsed.data.enabled,
      }),
    },
  });

  return NextResponse.json({
    ok: true,
    settings: toBudgetGuardSettingsView(row),
  });
}
