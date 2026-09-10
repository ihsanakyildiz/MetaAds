import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermission, type Permission } from "@/lib/permissions";

export async function getCurrentUser() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
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

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();

  if (!hasPermission(user.role, permission)) {
    redirect("/");
  }

  return user;
}

export async function requireApiPermission(permission: Permission) {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }),
    };
  }

  if (!hasPermission(user.role, permission)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
    };
  }

  return { user, response: null };
}
