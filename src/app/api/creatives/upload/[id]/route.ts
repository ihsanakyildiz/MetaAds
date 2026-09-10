import { unlink } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission(PERMISSIONS.CREATIVES_UPLOAD);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { id } = await context.params;
  const upload = await prisma.creativeUpload.findUnique({
    where: { id },
  });

  if (!upload) {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
  }

  const relative = upload.filePath.replace(/^\/+/, "");
  const absolute = path.join(process.cwd(), "public", relative);

  try {
    await unlink(absolute);
  } catch {
    // DB row still goes away if the file was already removed.
  }

  await prisma.creativeUpload.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: auth.user.id,
      action: "creatives.upload.delete",
      entity: "creative_upload",
      details: upload.name,
    },
  });

  return NextResponse.json({ ok: true });
}
