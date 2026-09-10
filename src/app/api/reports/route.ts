import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { PERMISSIONS } from "@/lib/permissions";
import { buildReports } from "@/lib/reports";

const querySchema = z.object({
  datePreset: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.REPORTS_VIEW);

  if (auth.response) {
    return auth.response;
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz tarih aralığı." }, { status: 400 });
  }

  const range =
    parsed.data.since && parsed.data.until
      ? {
          since: parsed.data.since,
          until: parsed.data.until,
        }
      : resolveDateRange(
          (parsed.data.datePreset as DateRangePreset | undefined) ?? "last_30d",
        );

  try {
    const report = await buildReports(range.since, range.until);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rapor üretilemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
