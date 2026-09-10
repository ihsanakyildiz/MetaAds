import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { getAiStatus } from "@/lib/ai";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.DASHBOARD_VIEW);

  if (auth.response) {
    return auth.response;
  }

  const status = await getAiStatus();

  return NextResponse.json({
    configured: status.configured,
    enabled: status.enabled,
    provider: status.provider,
    model: status.model,
    source: status.source,
  });
}
