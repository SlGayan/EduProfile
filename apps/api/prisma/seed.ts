import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const hashedPassword = await bcrypt.hash('password123', rounds);

  const users = [
    { email: 'teacher@edu.com', role: 'TEACHER' },
    { email: 'principal@edu.com', role: 'PRINCIPAL' },
    { email: 'admin@edu.com', role: 'ADMINISTRATOR' },
    { email: 'student@edu.com', role: 'STUDENT' },
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        password: hashedPassword,
        role: userData.role as any,
      },
    });
    console.log(`${userData.role} user created:`, user.email);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
