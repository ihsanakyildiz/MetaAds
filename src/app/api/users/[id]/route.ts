import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const updateUserSchema = z.object({
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission(PERMISSIONS.USERS_MANAGE);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if (id === auth.user.id && parsed.data.isActive === false) {
    return NextResponse.json(
      { error: "Kendi hesabınızı pasifleştiremezsiniz." },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.user.id,
      action: "users.update",
      entity: "user",
      details: `${user.email} role=${user.role} active=${user.isActive}`,
    },
  });

  return NextResponse.json({ user });
}
