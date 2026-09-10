import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { deleteCompetitorWatch } from "@/lib/competitors";
import { PERMISSIONS } from "@/lib/permissions";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission(PERMISSIONS.COMPETITORS_MANAGE);

  if (auth.response) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    await deleteCompetitorWatch(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Kayıt silinemedi." }, { status: 404 });
  }
}
