const {PrismaClient} = require('@prisma/client');
(async function(){
  const p = new PrismaClient();
  try {
    console.log('reagentMaterial', await p.reagentMaterial.count());
    console.log('reagentFormula', await p.reagentFormula.count());
    console.log('formulaComponent', await p.formulaComponent.count());
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
