import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function parseComponent(spec: { value: number; rawUnit: string }) {
  const rawUnit = (spec.rawUnit || '').toLowerCase()
  if (rawUnit === '%') {
    return { concentration: spec.value, unit: '%'}
  }
  // treat 'M' as molar, convert to mM
  if (rawUnit === 'm' || rawUnit === 'molar' || rawUnit === 'm') {
    return { concentration: spec.value * 1000, unit: 'mM' }
  }
  if (rawUnit === 'mm' || rawUnit === 'mmol' || rawUnit === 'mmol/l' || rawUnit === 'mm') {
    return { concentration: spec.value, unit: 'mM' }
  }
  // rawUnit might be 'mM' or 'mm' etc
  if (rawUnit === 'mm' || rawUnit === 'mmol' || rawUnit === 'mmol/l' || rawUnit === 'mm') {
    return { concentration: spec.value, unit: 'mM' }
  }
  // default: assume mM
  return { concentration: spec.value, unit: 'mM' }
}

async function main() {
  console.log('Starting seedFormulas...')

  const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
  if (!admin) {
    console.error('No admin user found. Aborting.')
    process.exit(1)
  }
  const createdBy = admin.id

  const reagentsList: { name: string; fullName?: string; category?: string; defaultUnit?: string }[] = [
    { name: 'Tris', fullName: 'Tris-HCl', category: '缓冲液', defaultUnit: 'M' },
    { name: 'HCl', fullName: 'Hydrochloric acid', category: '酸', defaultUnit: 'M' },
    { name: 'NaCl', fullName: 'Sodium Chloride', category: '盐', defaultUnit: 'M' },
    { name: 'EDTA', fullName: 'Ethylenediaminetetraacetic acid', category: '螯合剂', defaultUnit: 'M' },
    { name: 'SDS', fullName: 'Sodium dodecyl sulfate', category: '表面活性剂', defaultUnit: '%' },
    { name: 'Tween-20', fullName: 'Polysorbate 20', category: '表面活性剂', defaultUnit: '%' },
    { name: 'TritonX-100', fullName: 'Triton X-100', category: '表面活性剂', defaultUnit: '%' },
    { name: 'GITC', fullName: 'Guanidine isothiocyanate', category: '变性剂', defaultUnit: 'M' },
    { name: 'β-巯基乙醇', fullName: 'Beta-mercaptoethanol', category: '还原剂', defaultUnit: 'M' },
    { name: '蔗糖', fullName: 'Sucrose', category: '糖类', defaultUnit: '%' },
    { name: '甘油', fullName: 'Glycerol', category: '溶剂', defaultUnit: '%' },
    { name: 'BSA', fullName: 'Bovine Serum Albumin', category: '蛋白', defaultUnit: '%' },
    { name: 'MgCl2', fullName: 'Magnesium chloride', category: '盐', defaultUnit: 'M' },
    { name: 'KCl', fullName: 'Potassium chloride', category: '盐', defaultUnit: 'M' },
    { name: 'NH4SO4', fullName: 'Ammonium sulfate', category: '盐', defaultUnit: 'M' },
    { name: '吐温-20', fullName: 'Tween-20 (CN)', category: '表面活性剂', defaultUnit: '%' },
    { name: 'NaOH', fullName: 'Sodium hydroxide', category: '碱', defaultUnit: 'M' },
    { name: '乙醇', fullName: 'Ethanol', category: '溶剂', defaultUnit: '%' },
    { name: '异丙醇', fullName: 'Isopropanol', category: '溶剂', defaultUnit: '%' },
  ]

  for (const r of reagentsList) {
    try {
      await prisma.reagent.upsert({
        where: { name: r.name },
        update: {
          fullName: r.fullName || undefined,
          category: r.category || undefined,
          defaultUnit: r.defaultUnit || undefined,
          status: 'active',
        },
        create: {
          name: r.name,
          fullName: r.fullName || undefined,
          category: r.category || undefined,
          defaultUnit: r.defaultUnit || undefined,
          status: 'active',
        }
      })
    } catch (err) {
      console.error(`Failed upsert reagent ${r.name}:`, err)
    }
  }

  console.log('Reagents upsert completed.')

  const reagents = await prisma.reagent.findMany()
  const reagentMap = new Map<string, string>()
  reagents.forEach((r) => reagentMap.set(r.name, r.id))

  const getId = (name: string) => {
    const id = reagentMap.get(name)
    if (!id) throw new Error(`Reagent not found: ${name}`)
    return id
  }

  type CompSpec = { name: string; value: number; rawUnit: string }

  const formulas: { code: string; name: string; type: string; pH?: number; components: CompSpec[] }[] = [
    // CLY
    { code: 'CLY-01', name: '裂解液1号', type: 'CLY', pH: 8.0, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'EDTA', value: 1, rawUnit: 'mM' },
      { name: 'SDS', value: 0.1, rawUnit: '%' },
      { name: 'Tween-20', value: 1, rawUnit: '%' },
    ]},
    { code: 'CLY-02', name: '裂解液2号', type: 'CLY', pH: 7.5, components: [
      { name: 'Tris', value: 50, rawUnit: 'mM' },
      { name: 'NaCl', value: 100, rawUnit: 'mM' },
      { name: 'GITC', value: 4, rawUnit: 'M' },
      { name: 'β-巯基乙醇', value: 0.1, rawUnit: 'M' },
    ]},
    { code: 'CLY-03', name: '裂解液3号', type: 'CLY', pH: 8.0, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'EDTA', value: 1, rawUnit: 'mM' },
      { name: 'SDS', value: 1, rawUnit: '%' },
      { name: 'NaOH', value: 0.2, rawUnit: 'M' },
    ]},
    { code: 'CLY-04', name: '裂解液4号', type: 'CLY', pH: 7.4, components: [
      { name: 'Tris', value: 25, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'TritonX-100', value: 1, rawUnit: '%' },
      { name: 'EDTA', value: 5, rawUnit: 'mM' },
    ]},
    { code: 'CLY-05', name: '裂解液5号', type: 'CLY', pH: 8.0, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 200, rawUnit: 'mM' },
      { name: 'SDS', value: 0.5, rawUnit: '%' },
      { name: 'EDTA', value: 2, rawUnit: 'mM' },
      { name: '蔗糖', value: 10, rawUnit: '%' },
    ]},
    { code: 'CLY-06', name: '裂解液6号', type: 'CLY', pH: 7.5, components: [
      { name: 'Tris', value: 50, rawUnit: 'mM' },
      { name: 'GITC', value: 5.5, rawUnit: 'M' },
      { name: 'β-巯基乙醇', value: 0.1, rawUnit: 'M' },
    ]},
    { code: 'CLY-07', name: '裂解液7号', type: 'CLY', pH: 8.0, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 100, rawUnit: 'mM' },
      { name: 'SDS', value: 0.1, rawUnit: '%' },
      { name: '甘油', value: 10, rawUnit: '%' },
    ]},
    { code: 'CLY-08', name: '裂解液8号', type: 'CLY', pH: 7.4, components: [
      { name: 'Tris', value: 20, rawUnit: 'mM' },
      { name: 'NaCl', value: 137, rawUnit: 'mM' },
      { name: 'KCl', value: 2.7, rawUnit: 'mM' },
      { name: 'TritonX-100', value: 0.5, rawUnit: '%' },
    ]},
    { code: 'CLY-09', name: '裂解液9号', type: 'CLY', pH: 8.0, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'EDTA', value: 1, rawUnit: 'mM' },
      { name: 'NaOH', value: 0.5, rawUnit: 'M' },
      { name: 'SDS', value: 1, rawUnit: '%' },
    ]},
    { code: 'CLY-10', name: '裂解液10号', type: 'CLY', pH: 7.5, components: [
      { name: 'Tris', value: 100, rawUnit: 'mM' },
      { name: 'NaCl', value: 500, rawUnit: 'mM' },
      { name: 'GITC', value: 2, rawUnit: 'M' },
      { name: '乙醇', value: 20, rawUnit: '%' },
    ]},
    { code: 'CLY-11', name: '裂解液11号', type: 'CLY', pH: 8.0, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'SDS', value: 0.2, rawUnit: '%' },
      { name: 'BSA', value: 1, rawUnit: '%' },
    ]},
    { code: 'CLY-12', name: '裂解液12号', type: 'CLY', pH: 7.4, components: [
      { name: 'Tris', value: 50, rawUnit: 'mM' },
      { name: 'NaCl', value: 300, rawUnit: 'mM' },
      { name: '甘油', value: 20, rawUnit: '%' },
      { name: 'EDTA', value: 5, rawUnit: 'mM' },
    ]},
    // LJY subset
    { code: 'LJY-01', name: '离解液1号', type: 'LJY', pH: 7.5, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'EDTA', value: 1, rawUnit: 'mM' },
    ]},
    { code: 'LJY-02', name: '离解液2号', type: 'LJY', pH: 8.0, components: [
      { name: 'Tris', value: 50, rawUnit: 'mM' },
      { name: 'NaCl', value: 100, rawUnit: 'mM' },
      { name: 'MgCl2', value: 5, rawUnit: 'mM' },
    ]},
    { code: 'LJY-03', name: '离解液3号', type: 'LJY', pH: 7.4, components: [
      { name: 'Tris', value: 25, rawUnit: 'mM' },
      { name: 'KCl', value: 50, rawUnit: 'mM' },
      { name: 'MgCl2', value: 2, rawUnit: 'mM' },
    ]},
    { code: 'LJY-04', name: '离解液4号', type: 'LJY', pH: 7.5, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 200, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.05, rawUnit: '%' },
    ]},
    { code: 'LJY-05', name: '离解液5号', type: 'LJY', pH: 8.0, components: [
      { name: 'Tris', value: 20, rawUnit: 'mM' },
      { name: 'NaCl', value: 50, rawUnit: 'mM' },
      { name: 'EDTA', value: 2, rawUnit: 'mM' },
      { name: '甘油', value: 5, rawUnit: '%' },
    ]},
    { code: 'LJY-06', name: '离解液6号', type: 'LJY', pH: 7.4, components: [
      { name: 'Tris', value: 50, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'MgCl2', value: 10, rawUnit: 'mM' },
      { name: 'KCl', value: 5, rawUnit: 'mM' },
    ]},
    { code: 'LJY-07', name: '离解液7号', type: 'LJY', pH: 7.5, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 100, rawUnit: 'mM' },
      { name: 'BSA', value: 0.1, rawUnit: '%' },
    ]},
    // XDY
    { code: 'XDY-01', name: '洗涤液1号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
    ]},
    { code: 'XDY-02', name: '洗涤液2号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.05, rawUnit: '%' },
    ]},
    { code: 'XDY-03', name: '洗涤液3号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.1, rawUnit: '%' },
    ]},
    { code: 'XDY-04', name: '洗涤液4号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 150, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.2, rawUnit: '%' },
    ]},
    { code: 'XDY-05', name: '洗涤液5号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 500, rawUnit: 'mM' },
    ]},
    { code: 'XDY-06', name: '洗涤液6号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 500, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.05, rawUnit: '%' },
    ]},
    { code: 'XDY-07', name: '洗涤液7号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 500, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.1, rawUnit: '%' },
    ]},
    { code: 'XDY-08', name: '洗涤液8号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 500, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.2, rawUnit: '%' },
    ]},
    { code: 'XDY-09', name: '洗涤液9号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 1000, rawUnit: 'mM' },
    ]},
    { code: 'XDY-10', name: '洗涤液10号', type: 'XDY', pH: 7.4, components: [
      { name: 'Tris', value: 10, rawUnit: 'mM' },
      { name: 'NaCl', value: 1000, rawUnit: 'mM' },
      { name: 'Tween-20', value: 0.1, rawUnit: '%' },
    ]},
  ]

  let createdFormulas = 0
  let createdComponents = 0

  for (const f of formulas) {
    const exists = await prisma.reagentFormula.findUnique({ where: { code: f.code } })
    if (exists) {
      console.log(`Skipping existing formula ${f.code}`)
      continue
    }

    try {
      const created = await prisma.reagentFormula.create({
        data: {
          code: f.code,
          name: f.name,
          type: f.type,
          pH: f.pH,
          status: '正式',
          createdBy: createdBy,
          components: {
            create: f.components.map((c, idx) => {
              const parsed = parseComponent({ value: c.value, rawUnit: c.rawUnit })
              const reagentId = getId(c.name)
              createdComponents += 1
              return {
                reagentId,
                concentration: parsed.concentration,
                unit: parsed.unit,
                sortOrder: idx,
              }
            })
          }
        }
      })
      createdFormulas += 1
      console.log(`Created formula ${f.code}`)
    } catch (err) {
      console.error(`Failed create formula ${f.code}:`, err)
    }
  }

  console.log('--- Seed Summary ---')
  console.log(`Reagent attempted: ${reagentsList.length}`)
  console.log(`ReagentFormula created: ${createdFormulas}`)
  console.log(`FormulaComponent created: ${createdComponents}`)

  await prisma.$disconnect()
}

// build reagentMap variable after reagents are loaded
(async () => {
  try {
    await main()
  } catch (e) {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  }
})()
