import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import {
  createCompetitorWatch,
  listCompetitorWatches,
  listOwnProductHints,
} from "@/lib/competitors";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  kind: z.enum(["COMPANY", "PRODUCT"]),
  name: z.string().trim().min(2).max(200),
  query: z.string().trim().max(200).optional(),
  website: z.string().trim().max(400).optional(),
  searchTemplate: z.string().trim().max(500).optional(),
  pageId: z.string().trim().max(40).optional(),
  country: z.string().trim().max(4).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.COMPETITORS_VIEW);

  if (auth.response) {
    return auth.response;
  }

  const [items, products] = await Promise.all([
    listCompetitorWatches(),
    listOwnProductHints(),
  ]);

  return NextResponse.json({ items, products });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.COMPETITORS_MANAGE);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz form." },
      { status: 400 },
    );
  }

  const item = await createCompetitorWatch({
    kind: parsed.data.kind,
    name: parsed.data.name,
    query: parsed.data.query || parsed.data.name,
    website: parsed.data.website,
    searchTemplate: parsed.data.searchTemplate,
    pageId: parsed.data.pageId,
    country: parsed.data.country,
    notes: parsed.data.notes,
    createdById: auth.user.id,
  });

  return NextResponse.json(item);
}
