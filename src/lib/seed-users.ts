import { Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const SEED_USERS: Array<{
  name: string;
  email: string;
  password: string;
  role: Role;
}> = [
  {
    name: "Sistem Yöneticisi",
    email: "admin@metaads.local",
    password: "Admin123!",
    role: Role.ADMIN,
  },
  {
    name: "Analist Kullanıcı",
    email: "analist@metaads.local",
    password: "Analist123!",
    role: Role.ANALYST,
  },
  {
    name: "Reklam Veren",
    email: "reklam@metaads.local",
    password: "Reklam123!",
    role: Role.ADVERTISER,
  },
];

export async function ensureSeedUsers() {
  const count = await prisma.user.count();

  if (count > 0) {
    return false;
  }

  for (const user of SEED_USERS) {
    const password = await hash(user.password, 12);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        password,
        role: user.role,
        isActive: true,
      },
      create: {
        name: user.name,
        email: user.email,
        password,
        role: user.role,
      },
    });
  }

  return true;
}
