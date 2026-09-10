import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const users: Array<{
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

async function main() {
  for (const user of users) {
    const password = await hash(user.password, 12);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
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
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
