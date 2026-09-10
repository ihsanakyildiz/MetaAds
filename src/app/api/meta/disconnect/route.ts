import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { disconnectMetaAndWipeImportedData } from "@/lib/meta-disconnect";
import { PERMISSIONS } from "@/lib/permissions";

export async function POST() {
  const auth = await requireApiPermission(PERMISSIONS.SETTINGS_META);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  try {
    await disconnectMetaAndWipeImportedData(auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bağlantı kesilemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
