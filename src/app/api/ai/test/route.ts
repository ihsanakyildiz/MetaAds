import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { testAiConnection } from "@/lib/ai";
import { PERMISSIONS } from "@/lib/permissions";

export async function POST() {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await testAiConnection();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bağlantı testi başarısız.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
