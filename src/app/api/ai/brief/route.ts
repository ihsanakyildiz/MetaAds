import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { generateDashboardBrief } from "@/lib/ai-brief";
import { resolveAiConfig } from "@/lib/ai";
import { buildDashboard } from "@/lib/dashboard";
import { resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { PERMISSIONS } from "@/lib/permissions";

const bodySchema = z.object({
  datePreset: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.DASHBOARD_VIEW);

  if (auth.response) {
    return auth.response;
  }

  const config = await resolveAiConfig();

  if (!config) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Ücretsiz Groq anahtarı henüz yok. Ayarlar → Yapay zeka bölümünden ekleyin.",
      },
      { status: 412 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const range =
    parsed.data.since && parsed.data.until
      ? { since: parsed.data.since, until: parsed.data.until }
      : resolveDateRange(
          (parsed.data.datePreset as DateRangePreset | undefined) ?? "last_30d",
        );

  try {
    const dashboard = await buildDashboard(range.since, range.until);
    const brief = await generateDashboardBrief(dashboard, {
      force: parsed.data.force,
    });
    return NextResponse.json(brief);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analiz üretilemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
