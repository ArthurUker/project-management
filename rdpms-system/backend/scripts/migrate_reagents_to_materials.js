import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting reagents -> reagentMaterials migration...');
  const reagents = await prisma.reagent.findMany();
  console.log(`Found ${reagents.length} reagents`);

  for (const r of reagents) {
    try {
      const name = r.name;
      const alias = r.fullName && r.fullName !== r.name ? r.fullName : null;
      const state = r.density ? 'liquid' : 'solid';
      const mw = r.molecularWeight || 0; // ReagentMaterial.mw is required, set 0 if unknown

      const material = await prisma.reagentMaterial.upsert({
        where: { name },
        update: {},
        create: {
          name,
          alias,
          casNumber: r.casNumber || null,
          molecularFormula: null,
          mw,
          purity: r.purity ?? 98,
          density: r.density ?? null,
          state,
          defaultStockConc: null,
          defaultStockUnit: r.defaultUnit || null,
          supplier: r.supplier || null,
          notes: r.notes || null,
        }
      });

      // Update formula components that reference this reagent to also set reagentMaterialId when missing
      const updated = await prisma.formulaComponent.updateMany({
        where: { reagentId: r.id, reagentMaterialId: null },
        data: { reagentMaterialId: material.id }
      });

      console.log(`Mapped reagent ${r.name} -> material ${material.id}, components updated: ${updated.count}`);
    } catch (err) {
      console.error('Error processing reagent', r?.name, err.message || err);
    }
  }

  console.log('Migration completed.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
