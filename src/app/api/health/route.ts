import { NextResponse } from "next/server";
import { dbErrorMessage } from "@/lib/db-error";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const users = await prisma.user.count();

    return NextResponse.json({
      ok: true,
      database: true,
      users,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: false,
        error: dbErrorMessage(error),
      },
      { status: 503 },
    );
  }
}
