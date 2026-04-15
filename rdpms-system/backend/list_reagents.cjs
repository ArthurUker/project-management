const { PrismaClient } = require('@prisma/client');
(async ()=>{
  const p = new PrismaClient();
  const rs = await p.reagent.findMany();
  console.log('reagents:', rs.map(r=>r.name));
  await p.$disconnect();
})();
