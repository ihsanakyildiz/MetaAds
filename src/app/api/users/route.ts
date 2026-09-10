import { Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  email: z.string().email("Geçerli bir e-posta girin."),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
  role: z.nativeEnum(Role),
});

export async function GET() {
  const auth = await requireApiPermission(PERMISSIONS.USERS_MANAGE);

  if (auth.response) {
    return auth.response;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission(PERMISSIONS.USERS_MANAGE);

  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Geçersiz form." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email } });

  if (exists) {
    return NextResponse.json(
      { error: "Bu e-posta adresi zaten kayıtlı." },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      password: await hash(parsed.data.password, 12),
      role: parsed.data.role,
      createdById: auth.user.id,
    },
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
      action: "users.create",
      entity: "user",
      details: `${user.email} (${user.role})`,
    },
  });

  return NextResponse.json({ user });
}
