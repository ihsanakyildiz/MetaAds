import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { pauseGuardedAdSet } from "@/lib/budget-guard";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { PERMISSIONS } from "@/lib/permissions";

const bodySchema = z.object({
  adSetId: z.string().min(1),
  closePassword: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_MANAGE);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Reklam seti seçilmedi." }, { status: 400 });
  }

  const denied = await rejectIfInvalidCloseSecret(parsed.data.closePassword);

  if (denied) {
    return denied;
  }

  try {
    await pauseGuardedAdSet(parsed.data.adSetId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam seti kapatılamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
