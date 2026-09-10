import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import {
  deleteCompetitorWatch,
  updateCompetitorWatch,
} from "@/lib/competitors";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  website: z.string().trim().max(400).optional(),
  searchTemplate: z.string().trim().max(500).optional(),
  searchEngines: z
    .array(
      z.enum([
        "google",
        "google_shopping",
        "bing",
        "yandex",
        "duckduckgo",
      ]),
    )
    .max(8)
    .optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission(PERMISSIONS.COMPETITORS_MANAGE);

  if (auth.response) {
    return auth.response;
  }

  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz form." },
      { status: 400 },
    );
  }

  try {
    const item = await updateCompetitorWatch(id, parsed.data);
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Kayıt güncellenemedi." }, { status: 404 });
  }
}

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
