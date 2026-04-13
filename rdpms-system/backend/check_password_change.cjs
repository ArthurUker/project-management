const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    console.log('admin user:', JSON.stringify(admin, null, 2));

    const logs = await prisma.systemLog.findMany({
      where: { userId: admin.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    console.log('recent system logs for admin (last 50):');
    console.log(JSON.stringify(logs, null, 2));

    const passwordLogs = await prisma.systemLog.findMany({
      where: {
        userId: admin.id,
        OR: [
          { action: { contains: 'password' } },
          { action: { contains: 'passwd' } },
          { action: { contains: 'update' } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log('password/update-related logs:');
    console.log(JSON.stringify(passwordLogs, null, 2));
  } catch (e) {
    console.error('error', e);
  } finally {
    await prisma.$disconnect();
  }
})();