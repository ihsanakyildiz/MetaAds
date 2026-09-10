import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { listAccountAssets, listWritableAccounts } from "@/lib/meta-ads-write";
import { PERMISSIONS } from "@/lib/permissions";

const querySchema = z.object({
  accountId: z.string().optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CAMPAIGNS_MANAGE);

  if (auth.response) {
    return auth.response;
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  try {
    const accounts = await listWritableAccounts();

    if (!parsed.data.accountId) {
      return NextResponse.json({ accounts });
    }

    const assets = await listAccountAssets(parsed.data.accountId);

    return NextResponse.json({
      accounts,
      account: assets.account,
      pages: assets.pages,
      pixels: assets.pixels,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meta varlıkları alınamadı.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
