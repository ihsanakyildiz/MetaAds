import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { rejectIfInvalidCloseSecret } from "@/lib/close-secret";
import { updateMetaAd } from "@/lib/meta-ads-write";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(400).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  closePassword: z.string().optional(),
  pageId: z.string().optional(),
  message: z.string().trim().max(2000).optional(),
  headline: z.string().trim().max(255).optional(),
  description: z.string().trim().max(500).optional(),
  link: z.string().url().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
  cta: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_MANAGE);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reklam güncellemesi geçersiz." },
      { status: 400 },
    );
  }

  const wantsCreative = Boolean(
    parsed.data.pageId && parsed.data.message && parsed.data.link,
  );

  if (wantsCreative && (!parsed.data.pageId || !parsed.data.message || !parsed.data.link)) {
    return NextResponse.json(
      { error: "Kreatif güncellemek için sayfa, metin ve bağlantı gerekli." },
      { status: 400 },
    );
  }

  const denied = await rejectIfInvalidCloseSecret(parsed.data.closePassword);

  if (denied) {
    return denied;
  }

  try {
    const ad = await updateMetaAd(id, {
      name: parsed.data.name,
      status: parsed.data.status,
      creative: wantsCreative
        ? {
            pageId: parsed.data.pageId ?? "",
            message: parsed.data.message ?? "",
            headline: parsed.data.headline,
            description: parsed.data.description,
            link: parsed.data.link ?? "",
            imageUrl: parsed.data.imageUrl || undefined,
            cta: parsed.data.cta || "LEARN_MORE",
          }
        : undefined,
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "meta.ad.update",
        entity: "meta_ad",
        details: `${ad.name} (${ad.metaAdId})`,
      },
    });

    return NextResponse.json({ ok: true, ad });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reklam güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
