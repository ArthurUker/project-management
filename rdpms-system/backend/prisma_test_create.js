(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  try {
    const user = await p.user.findFirst();
    if (!user) {
      console.log('No user found in DB - cannot run test');
      return;
    }

    const code = `TEST-${Date.now()}`;
    const proj = await p.project.create({
      data: {
        name: '测试',
        type: '定制',
        isDraft: false,
        status: '规划中',
        position: '测试2',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        code,
        manager: { connect: { id: user.id } }
      }
    });
    console.log('Created project id:', proj.id);
  } catch (e) {
    console.error('Error:', e?.message || e);
  } finally {
    await p.$disconnect();
  }
})();
