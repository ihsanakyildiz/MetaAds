import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, signSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Geçerli bir e-posta ve şifre girin." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: "E-posta veya şifre hatalı." },
      { status: 401 },
    );
  }

  const valid = await compare(parsed.data.password, user.password);

  if (!valid) {
    return NextResponse.json(
      { error: "E-posta veya şifre hatalı." },
      { status: 401 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "auth.login",
      entity: "user",
      details: user.email,
    },
  });

  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  await setSessionCookie(token, request);

  return NextResponse.json({ ok: true });
}
