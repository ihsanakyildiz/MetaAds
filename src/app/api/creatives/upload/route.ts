import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 24 * 1024 * 1024;

const ALLOWED: Record<string, { ext: string; kind: "IMAGE" | "VIDEO" }> = {
  "image/jpeg": { ext: ".jpg", kind: "IMAGE" },
  "image/png": { ext: ".png", kind: "IMAGE" },
  "image/webp": { ext: ".webp", kind: "IMAGE" },
  "image/gif": { ext: ".gif", kind: "IMAGE" },
  "video/mp4": { ext: ".mp4", kind: "VIDEO" },
  "video/webm": { ext: ".webm", kind: "VIDEO" },
  "video/quicktime": { ext: ".mov", kind: "VIDEO" },
};

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.CREATIVES_UPLOAD);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const givenName = String(form?.get("name") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya seçilmedi." }, { status: 400 });
  }

  const allowed = ALLOWED[file.type];

  if (!allowed) {
    return NextResponse.json(
      { error: "Sadece JPG, PNG, WEBP, GIF, MP4, WEBM veya MOV yükleyin." },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Dosya 24 MB'dan küçük olmalıdır." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = `${randomBytes(12).toString("hex")}${allowed.ext}`;
  const directory = path.join(process.cwd(), "public", "uploads", "creatives");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), buffer);

  const publicPath = `/uploads/creatives/${fileName}`;
  const name = givenName || file.name.replace(/\.[^.]+$/, "") || "Yeni kreatif";

  const upload = await prisma.creativeUpload.create({
    data: {
      name,
      kind: allowed.kind,
      filePath: publicPath,
      mimeType: file.type,
      fileSize: file.size,
      createdById: auth.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.user.id,
      action: "creatives.upload",
      entity: "creative_upload",
      details: `${upload.name} (${upload.kind})`,
    },
  });

  return NextResponse.json({ ok: true, upload });
}
