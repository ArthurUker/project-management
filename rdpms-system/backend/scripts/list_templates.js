(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  try {
    const t = await p.projectTemplate.findMany({ select: { id: true, name: true, content: true } });
    console.log(JSON.stringify(t, null, 2));
  } catch (e) {
    console.error(e.message || e);
  } finally {
    await p.$disconnect();
  }
})();
