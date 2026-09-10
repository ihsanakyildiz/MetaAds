import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { buildCreativeRecommendations } from "@/lib/creatives";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.CREATIVES_VIEW);

  if (auth.response) {
    return auth.response;
  }

  try {
    const payload = await buildCreativeRecommendations();
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kreatif önerileri hesaplanamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
