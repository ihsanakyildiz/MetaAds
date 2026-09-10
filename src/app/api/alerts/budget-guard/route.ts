import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acknowledgeBudgetAlert,
  listOpenBudgetAlerts,
} from "@/lib/budget-guard";
import { requireApiPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

const ackSchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_VIEW);

  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({
    alerts: await listOpenBudgetAlerts(),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_VIEW);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = ackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Uyarı seçilmedi." }, { status: 400 });
  }

  try {
    await acknowledgeBudgetAlert(parsed.data.id);
  } catch {
    return NextResponse.json({ error: "Uyarı bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
