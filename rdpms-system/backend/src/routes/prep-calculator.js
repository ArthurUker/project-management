import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';

/**
 * /api/prep（M-1 P0）：
 *   POST /api/prep/calculate  formulas.view（计算不落库）
 *   POST /api/prep/records    prep_records.create
 *   GET  /api/prep/records    prep_records.view
 *   GET  /api/prep/records/:id prep_records.view
 *
 * 新 schema：组分只关联 reagent_materials（materialId）。
 */
const prep = new Hono();

prep.use('*', authMiddleware);

// POST /calculate —— 试算
prep.post('/calculate', requirePermission('formulas.view'), async (c) => {
  const { formulaId, targetVolume } = await c.req.json().catch(() => ({}));
  const normalizedTargetVolume = Number(targetVolume);
  if (!formulaId || !normalizedTargetVolume) return c.json({ error: 'formulaId and targetVolume required' }, 400);

  const formula = await prisma.reagentFormula.findUnique({
    where: { id: formulaId },
    include: { components: { include: { material: true }, orderBy: { sortOrder: 'asc' } } },
  });
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
    missingMW: [],
  };

  for (const comp of formula.components) {
    const material = comp.material;
    const conc = Number(comp.concentration || 0);
    const concUnit = normalizeConcUnit(comp.unit);
    let powderAmountG = null;
    let powderAmountML = null;
    let stockAmountML = null;
    let stockWarning = null;
    let warning = null;

    if (concUnit === 'M' || concUnit === 'mM') {
      const targetM = concUnit === 'mM' ? conc / 1000 : conc;
      const mw = material?.molecularWeight != null ? Number(material.molecularWeight) : null;
      const purity = material?.purity != null ? Number(material.purity) : 100;
      if (mw) {
        powderAmountG = targetM * (normalizedTargetVolume / 1000) * mw / (purity / 100);
        powderAmountG = round2(powderAmountG);
        if (material?.density) powderAmountML = round2(powderAmountG / Number(material.density));
      } else {
        result.missingMW.push(material?.commonName || comp.customName || comp.id);
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
      powderAmountG = round2((conc / 100) * normalizedTargetVolume);
      if (material?.density) powderAmountML = round2(powderAmountG / Number(material.density));

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
    result.components.push({
      reagentName: material?.commonName || comp.customName || '未命名组分',
      concentration: conc,
      concUnit,
      molecularWeight: material?.molecularWeight ?? null,
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
      displayAmount: stockAmountML != null ? stockDisplay : powderDisplay,
      warning,
    });
  }

  return c.json({ success: true, ...result });
});

// POST /records —— 保存配制记录
prep.post('/records', requirePermission('prep_records.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  if (!raw?.formulaId || !raw?.targetVolume || !raw?.calcResult) {
    return c.json({ error: 'Missing fields' }, 400);
  }
  const created = await prisma.prepRecord.create({
    data: {
      formulaId: raw.formulaId,
      targetVolume: raw.targetVolume,
      volumeUnit: raw.volumeUnit || 'mL',
      calcResult: raw.calcResult,
      prepDate: raw.prepDate ? new Date(raw.prepDate) : new Date(),
      operator: raw.operator || null,
      batchNo: raw.batchNo || null,
      notes: raw.notes || null,
      createdById: auth.userId,
    },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PREP_RECORD',
    entityId: created.id,
    metadata: { permissionCode: 'prep_records.create' },
  });
  return c.json({ success: true, record: created });
});

// GET /records
prep.get('/records', requirePermission('prep_records.view'), async (c) => {
  const formulaId = c.req.query('formulaId');
  const where = {};
  if (formulaId) where.formulaId = formulaId;
  const list = await prisma.prepRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { formula: { select: { id: true, code: true, name: true } } },
  });
  return c.json({ success: true, list });
});

// GET /records/:id
prep.get('/records/:id', requirePermission('prep_records.view'), async (c) => {
  const record = await prisma.prepRecord.findUnique({
    where: { id: c.req.param('id') },
    include: {
      formula: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, displayName: true } },
    },
  });
  if (!record) return c.json({ error: '记录不存在' }, 404);
  return c.json({ success: true, record });
});

export default prep;
