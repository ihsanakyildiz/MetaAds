import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { analyzeCompetitorAds } from "@/lib/competitors";
import { PERMISSIONS } from "@/lib/permissions";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission(PERMISSIONS.META_AD_LIBRARY);

  if (auth.response) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    const insight = await analyzeCompetitorAds(id);
    return NextResponse.json(insight);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam taraması başarısız.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
