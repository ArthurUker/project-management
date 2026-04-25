import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const prep = new Hono();
prep.use('*', authMiddleware);

// POST /api/prep/calculate 计算（不保存）
prep.post('/calculate', async (c) => {
  try {
    const { formulaId, targetVolume } = await c.req.json();
    const normalizedTargetVolume = Number(targetVolume);
    if (!formulaId || !normalizedTargetVolume) return c.json({ error: 'formulaId and targetVolume required' }, 400);

    const formula = await prisma.reagentFormula.findUnique({ where: { id: formulaId }, include: { components: { include: { reagent: true, reagentMaterial: true } } } });
    if (!formula) return c.json({ error: 'Formula not found' }, 404);

    const round2 = (value) => Math.round(value * 100) / 100;
    const normalizeConcUnit = (unit) => {
      const raw = String(unit || 'M').trim().toLowerCase();
      if (raw === 'm') return 'M';
      if (raw === 'mm' || raw === 'mmol' || raw === 'mmol/l' || raw === 'mm/l') return 'mM';
      if (raw.includes('%')) return '%';
      return unit || 'M';
    };
    const normalizeStockUnit = (unit) => {
      const raw = String(unit || '').trim().toLowerCase();
      if (!raw) return '';
      if (raw === 'm') return 'M';
      if (raw === 'mm' || raw === 'mmol' || raw === 'mmol/l' || raw === 'mm/l') return 'mM';
      if (raw.includes('%')) return '%';
      return String(unit).trim();
    };

    const result = {
      formulaCode: formula.code,
      formulaName: formula.name,
      pH: formula.pH,
      targetVolume: normalizedTargetVolume,
      unit: 'mL',
      components: [],
      missingMW: []
    };

    // 兼容历史数据：旧配方组件可能只关联了 reagentId，
    // 此时按名称从知识库 ReagentMaterial 回查分子量等参数。
    const allMaterials = await prisma.reagentMaterial.findMany({
      select: {
        id: true,
        name: true,
        commonName: true,
        chineseName: true,
        englishName: true,
        mw: true,
        purity: true,
        density: true,
        defaultStockConc: true,
        defaultStockUnit: true
      }
    });
    const materialByName = new Map();
    for (const m of allMaterials) {
      const keys = [m.commonName, m.name, m.chineseName, m.englishName]
        .filter(Boolean)
        .map((v) => String(v).trim().toLowerCase());
      for (const key of keys) {
        if (!materialByName.has(key)) materialByName.set(key, m);
      }
    }

    for (const comp of formula.components) {
      // 优先使用关联原料；其次按旧 reagent 名称回查知识库；最后才回退旧 reagent。
      const reagentName = comp.reagent?.name ? String(comp.reagent.name).trim().toLowerCase() : '';
      const materialFallback = reagentName ? materialByName.get(reagentName) : null;
      const material = comp.reagentMaterial || materialFallback || comp.reagent;
      const conc = Number(comp.concentration || 0);
      const concUnit = normalizeConcUnit(comp.unit);
      let powderAmountG = null;
      let powderAmountML = null;
      let stockAmountML = null;
      let stockWarning = null;
      let warning = null;

      if (concUnit === 'M' || concUnit === 'mM') {
        const targetM = concUnit === 'mM' ? conc / 1000 : conc;
        const mw = material?.mw ?? material?.molecularWeight;
        const purity = material?.purity ?? 100;
        if (mw) {
          powderAmountG = targetM * (normalizedTargetVolume / 1000) * mw / (purity / 100);
          powderAmountG = round2(powderAmountG);
          if (material?.density) {
            powderAmountML = round2(powderAmountG / material.density);
          }
        } else {
          result.missingMW.push(material?.commonName || material?.chineseName || material?.name || material?.id);
          warning = '缺少分子量，无法计算';
        }

        const stockConc = Number(material?.defaultStockConc || 0);
        const stockUnit = normalizeStockUnit(material?.defaultStockUnit);
        if (stockConc > 0) {
          if (stockUnit === 'M' || stockUnit === 'mM') {
            const stockM = stockUnit === 'mM' ? stockConc / 1000 : stockConc;
            if (stockM <= targetM) {
              stockWarning = '母液浓度不高于目标终浓度，不能直接稀释';
            } else {
              stockAmountML = round2((targetM * normalizedTargetVolume) / stockM);
            }
          } else {
            stockWarning = '母液单位与目标终浓度单位不匹配，无法按稀释比例计算';
          }
        }
      } else if (concUnit === '%') {
        // 按质量体积分数计算（% 视为 m/v）
        powderAmountG = (conc / 100) * normalizedTargetVolume;
        powderAmountG = round2(powderAmountG);
        if (material?.density) {
          powderAmountML = round2(powderAmountG / material.density);
        }

        const stockConc = Number(material?.defaultStockConc || 0);
        const stockUnit = normalizeStockUnit(material?.defaultStockUnit);
        if (stockConc > 0) {
          if (stockUnit === '%') {
            if (stockConc <= conc) {
              stockWarning = '母液浓度不高于目标终浓度，不能直接稀释';
            } else {
              stockAmountML = round2((conc * normalizedTargetVolume) / stockConc);
            }
          } else {
            stockWarning = '母液单位与目标终浓度单位不匹配，无法按稀释比例计算';
          }
        }
      }

      const powderDisplay = powderAmountG != null
        ? `${powderAmountG} g${powderAmountML != null ? `（约 ${powderAmountML} mL）` : ''}`
        : 'N/A';
      const stockDisplay = stockAmountML != null ? `${stockAmountML} mL` : 'N/A';
      const displayAmount = stockAmountML != null ? stockDisplay : powderDisplay;
      result.components.push({
        reagentName: material?.commonName || material?.chineseName || material?.name || '未命名试剂',
        concentration: conc,
        concUnit,
        molecularWeight: material?.mw ?? material?.molecularWeight ?? null,
        purity: material?.purity ?? null,
        amountG: powderAmountG,
        amountML: stockAmountML ?? powderAmountML,
        powderAmountG,
        powderAmountML,
        powderDisplay,
        stockAmountML,
        stockDisplay,
        stockConc: material?.defaultStockConc ?? null,
        stockUnit: material?.defaultStockUnit ?? null,
        stockWarning,
        displayAmount,
        warning
      });
    }

    return c.json({ success: true, ...result });
  } catch (err) {
    console.error('计算失败', err);
    return c.json({ error: '计算失败' }, 500);
  }
});

// POST /api/prep/records 保存配制记录
prep.post('/records', async (c) => {
  try {
    const data = await c.req.json();
    const userId = c.get('userId');
    if (!data.formulaId || !data.targetVolume || !data.calcResult) return c.json({ error: 'Missing fields' }, 400);

    const created = await prisma.prepRecord.create({
      data: {
        formulaId: data.formulaId,
        targetVolume: data.targetVolume,
        calcResult: JSON.stringify(data.calcResult),
        prepDate: data.prepDate || new Date().toISOString().slice(0,10),
        operator: data.operator || null,
        batchNo: data.batchNo || null,
        notes: data.notes || null,
        createdBy: userId
      }
    });

    return c.json({ success: true, record: created });
  } catch (err) {
    console.error('保存配制记录失败', err);
    return c.json({ error: '保存配制记录失败' }, 500);
  }
});

// GET /api/prep/records 列表 支持 ?formulaId=
prep.get('/records', async (c) => {
  try {
    const formulaId = c.req.query('formulaId');
    const where = {};
    if (formulaId) where.formulaId = formulaId;
    const list = await prisma.prepRecord.findMany({ where, orderBy: { createdAt: 'desc' } });
    return c.json({ success: true, list });
  } catch (err) {
    console.error('获取配制记录失败', err);
    return c.json({ error: '获取配制记录失败' }, 500);
  }
});

// GET /api/prep/records/:id 详情
prep.get('/records/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const record = await prisma.prepRecord.findUnique({ where: { id }, include: { formula: true, creator: { select: { id: true, name: true } } } });
    if (!record) return c.json({ error: '记录不存在' }, 404);
    // parse calcResult JSON
    record.calcResult = JSON.parse(record.calcResult);
    return c.json({ success: true, record });
  } catch (err) {
    console.error('获取配制记录详情失败', err);
    return c.json({ error: '获取配制记录详情失败' }, 500);
  }
});

export default prep;