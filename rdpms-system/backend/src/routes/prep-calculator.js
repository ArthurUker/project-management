import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const prep = new Hono();
prep.use('*', authMiddleware);

// POST /api/prep/calculate 计算（不保存）
prep.post('/calculate', async (c) => {
  try {
    const { formulaId, targetVolume } = await c.req.json();
    if (!formulaId || !targetVolume) return c.json({ error: 'formulaId and targetVolume required' }, 400);

    const formula = await prisma.reagentFormula.findUnique({ where: { id: formulaId }, include: { components: { include: { reagent: true, reagentMaterial: true } } } });
    if (!formula) return c.json({ error: 'Formula not found' }, 404);

    const result = {
      formulaCode: formula.code,
      formulaName: formula.name,
      pH: formula.pH,
      targetVolume,
      unit: 'mL',
      components: [],
      missingMW: []
    };

    for (const comp of formula.components) {
      // 优先使用关联的原料库数据（reagentMaterial），若不存在则回退到旧的 reagent
      const material = comp.reagentMaterial || comp.reagent;
      const conc = comp.concentration;
      const concUnit = comp.unit || 'M';
      let amountG = null;
      let amountML = null;
      let warning = null;

      if (concUnit === 'M') {
        const mw = material?.mw ?? material?.molecularWeight;
        const purity = material?.purity ?? 100;
        if (mw) {
          amountG = conc * (targetVolume / 1000) * mw / (purity / 100);
          amountG = Math.round(amountG * 100) / 100;
          if (material?.density) {
            amountML = Math.round((amountG / material.density) * 100) / 100;
          }
        } else {
          result.missingMW.push(material?.name || material?.id);
          warning = '缺少分子量，无法计算';
        }
      } else if (concUnit === '%') {
        // 按质量体积分数计算（% 为 w/v）
        amountG = (conc / 100) * targetVolume; // g
        amountG = Math.round(amountG * 100) / 100;
        if (reagent.density) {
          amountML = Math.round((amountG / reagent.density) * 100) / 100;
        }
      }

      const displayAmount = amountML ? `${amountML} mL` : amountG ? `${amountG} g` : 'N/A';
      result.components.push({
        reagentName: reagent.name,
        concentration: conc,
        concUnit,
        molecularWeight: reagent.molecularWeight,
        purity: reagent.purity,
        amountG,
        amountML,
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