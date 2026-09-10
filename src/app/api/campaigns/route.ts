import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import {
  CAMPAIGN_PAGE_SIZE,
  getCampaignFacets,
  queryCampaigns,
  type CampaignSort,
} from "@/lib/campaigns";
import type { DateRangePreset } from "@/lib/date-range";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { createMetaCampaign } from "@/lib/meta-ads-write";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  accountId: z.string().optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  objective: z.string().optional(),
  minSpend: z.coerce.number().optional(),
  maxSpend: z.coerce.number().optional(),
  minClicks: z.coerce.number().optional(),
  onlyWithSpend: z
    .enum(["1", "true"])
    .optional()
    .transform((value) => Boolean(value)),
  sort: z
    .enum(["spend", "clicks", "ctr", "name", "status"])
    .optional()
    .default("spend"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(CAMPAIGN_PAGE_SIZE),
  datePreset: z
    .enum([
      "today",
      "yesterday",
      "today_yesterday",
      "last_7d",
      "last_14d",
      "last_28d",
      "last_30d",
      "this_week",
      "last_week",
      "this_month",
      "last_month",
      "maximum",
      "custom",
    ])
    .optional()
    .default("last_30d"),
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
    return NextResponse.json({ error: "Geçersiz filtre." }, { status: 400 });
  }

  const filters = {
    accountId: parsed.data.accountId,
    query: parsed.data.q,
    status: parsed.data.status,
    objective: parsed.data.objective,
    minSpend: parsed.data.minSpend,
    maxSpend: parsed.data.maxSpend,
    minClicks: parsed.data.minClicks,
    onlyWithSpend: parsed.data.onlyWithSpend,
    sort: parsed.data.sort as CampaignSort,
    datePreset: parsed.data.datePreset as DateRangePreset,
    since: parsed.data.since,
    until: parsed.data.until,
  };

  try {
    const [result, facets] = await Promise.all([
      queryCampaigns(filters, parsed.data.page, parsed.data.limit),
      parsed.data.page === 1
        ? getCampaignFacets(parsed.data.accountId)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ...result,
      facets,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kampanyalar yüklenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(1).max(400),
  objective: z.enum([
    "OUTCOME_SALES",
    "OUTCOME_TRAFFIC",
    "OUTCOME_LEADS",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_AWARENESS",
    "OUTCOME_APP_PROMOTION",
  ]),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  specialAdCategory: z
    .enum([
      "NONE",
      "HOUSING",
      "EMPLOYMENT",
      "CREDIT",
      "ISSUES_ELECTIONS_POLITICS",
    ])
    .default("NONE"),
  budgetType: z.enum(["none", "daily", "lifetime"]).default("none"),
  budgetAmount: z.coerce.number().positive().optional(),
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
      { error: "Kampanya bilgileri eksik veya geçersiz." },
      { status: 400 },
    );
  }

  const { closePassword, ...input } = parsed.data;
  const denied = await rejectIfInvalidCloseSecret(closePassword);

  if (denied) {
    return denied;
  }

  try {
    const campaign = await createMetaCampaign(input);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.campaign.create",
        entity: "meta_campaign",
        details: `${campaign.name} (${campaign.metaCampaignId})`,
      },
    });

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kampanya oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
