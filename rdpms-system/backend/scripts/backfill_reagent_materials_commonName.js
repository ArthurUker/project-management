import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main(){
  console.log('开始回填 reagentMaterial.commonName');
  const mats = await prisma.reagentMaterial.findMany();
  for(const m of mats){
    if(!m.commonName && m.name){
      await prisma.reagentMaterial.update({ where: { id: m.id }, data: { commonName: m.name } });
      console.log('backfilled', m.id, m.name);
    }
  }
  console.log('done');
}

main().catch(e=>{ console.error(e); process.exit(1); }).finally(()=> prisma.$disconnect());
