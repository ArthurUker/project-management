import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main(){
  const reagents = [
    { name: "GITC", fullName: "异硫氰酸胍", casNumber: "593-84-0", category: "变性剂", molecularWeight: 118.16, purity: 98, defaultUnit: "M" },
    { name: "GuHCl", fullName: "盐酸胍", casNumber: "50-01-1", category: "变性剂", molecularWeight: 95.53, purity: 99, defaultUnit: "M" },
    { name: "SDS", fullName: "十二烷基硫酸钠", casNumber: "151-21-3", category: "表面活性剂", molecularWeight: 288.38, purity: 99, defaultUnit: "%" },
    { name: "SLS", fullName: "十二烷基硫酸锂", casNumber: "2044-56-6", category: "表面活性剂", molecularWeight: 272.25, purity: 98, defaultUnit: "%" },
    { name: "CTAB", fullName: "十六烷基三甲基溴化铵", casNumber: "57-09-0", category: "表面活性剂", molecularWeight: 364.45, purity: 99, defaultUnit: "%" },
    { name: "Tween-20", fullName: "聚山梨酯20", casNumber: "9005-64-5", category: "表面活性剂", molecularWeight: null, purity: 100, density: 1.09, defaultUnit: "%" },
    { name: "NaCl", fullName: "氯化钠", casNumber: "7647-14-5", category: "盐", molecularWeight: 58.44, purity: 99.5, defaultUnit: "M" },
    { name: "NaAc", fullName: "乙酸钠", casNumber: "127-09-3", category: "盐", molecularWeight: 82.03, purity: 99, defaultUnit: "M" },
    { name: "CaCl2", fullName: "氯化钙", casNumber: "10043-52-4", category: "盐", molecularWeight: 110.98, purity: 99, defaultUnit: "M" },
    { name: "MgCl2", fullName: "氯化镁", casNumber: "7786-30-3", category: "盐", molecularWeight: 95.21, purity: 99, defaultUnit: "M" },
    { name: "Tris", fullName: "三羟甲基氨基甲烷", casNumber: "77-86-1", category: "缓冲液", molecularWeight: 121.14, purity: 99, defaultUnit: "M" },
    { name: "H3BO3", fullName: "硼酸", casNumber: "10043-35-3", category: "缓冲液", molecularWeight: 61.83, purity: 99.5, defaultUnit: "M" },
    { name: "Na2HPO4", fullName: "磷酸氢二钠", casNumber: "7558-79-4", category: "缓冲液", molecularWeight: 141.96, purity: 99, defaultUnit: "M" },
    { name: "Borax", fullName: "四硼酸钠十水合物", casNumber: "1303-96-4", category: "缓冲液", molecularWeight: 381.37, purity: 99.5, defaultUnit: "M" },
    { name: "EDTA-2Na", fullName: "乙二胺四乙酸二钠", casNumber: "6381-92-6", category: "螯合剂", molecularWeight: 372.24, purity: 99, defaultUnit: "M" },
    { name: "PVP", fullName: "聚乙烯吡咯烷酮", casNumber: "9003-39-8", category: "聚合物", molecularWeight: null, purity: 100, defaultUnit: "%" },
    { name: "PEG8000", fullName: "聚乙二醇8000", casNumber: "25322-68-3", category: "聚合物", molecularWeight: null, purity: 100, defaultUnit: "%" },
    { name: "PEG6000", fullName: "聚乙二醇6000", casNumber: "25322-68-3", category: "聚合物", molecularWeight: null, purity: 100, defaultUnit: "%" },
    { name: "PEG600", fullName: "聚乙二醇600", casNumber: "25322-68-3", category: "聚合物", molecularWeight: 600, purity: 100, density: 1.13, defaultUnit: "%" },
  ]

  for (const r of reagents){
    await prisma.reagent.upsert({
      where: { name: r.name },
      update: r,
      create: r,
    })
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => { prisma.$disconnect() })
