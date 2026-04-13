const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, status: true, createdAt: true } });
    console.log(JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Query error', e);
  } finally {
    await prisma.$disconnect();
  }
})();
