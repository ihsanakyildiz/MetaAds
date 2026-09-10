import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { probeAdLibrary } from "@/lib/meta-ad-library";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.META_AD_LIBRARY);

  if (auth.response) {
    return auth.response;
  }

  const status = await probeAdLibrary();
  return NextResponse.json(status);
}
