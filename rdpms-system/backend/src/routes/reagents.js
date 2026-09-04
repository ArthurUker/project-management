import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { notFound, methodNotAllowed, parsePaging, paged } from '../kernel/http.js';

/**
 * /api/reagents —— 聚合读取/导出路由（M-1 §8.1）。
 *
 * 不对应任何 Reagent model（schema 已删除，禁止恢复 Reagent 访问写法）；
 * 底层表：reagent_materials / reagent_lots / reagent_formulas。
 *
 *   GET /api/reagents              reagents.view
 *   GET /api/reagents/:id          reagents.view
 *   GET /api/reagents/export       reagents.export（P0 唯一试剂导出出口）
 *   POST/PATCH/PUT/DELETE          405
 *
 * 无 reagent_materials.view / formulas.view 时相关字段返回 null（key 不省略）。
 */
const reagents = new Hono();

reagents.use('*', authenticate);

// ── 405 固定：聚合路由不提供写方法 ───────────────────────────────────────────
// 注意：/export 的 GET/POST 是合法静态路由（在文件底部注册）；
// 此处不注册 POST /:id（无业务意义且会按注册顺序抢先匹配 /export）。
reagents.post('/', () => { throw methodNotAllowed(); });
reagents.put('/:id', () => { throw methodNotAllowed(); });
reagents.patch('/:id', () => { throw methodNotAllowed(); });
reagents.delete('/:id', () => { throw methodNotAllowed(); });

function lotAggregates(lots) {
  const now = Date.now();
  const active = lots.filter((l) => l.status === 'AVAILABLE');
  const totalQuantity = active.reduce((s, l) => s + Number(l.quantity ?? 0), 0);
  const expiring = active.filter(
    (l) => l.expiryDate && new Date(l.expiryDate).getTime() - now < 90 * 24 * 3600 * 1000,
  ).length;
  return { totalQuantity, lotCount: active.length, expiringSoonCount: expiring };
}

// ── 聚合列表 ─────────────────────────────────────────────────────────────────
reagents.get('/', requirePermission('reagents.view'), async (c) => {
  const auth = getAuth(c);
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 50);
  const { category, keyword, status } = c.req.query();

  const where = {};
  if (category) where.category = category;
  if (status) where.status = status;
  if (keyword) {
    where.OR = [
      { commonName: { contains: keyword } },
      { chineseName: { contains: keyword } },
      { englishName: { contains: keyword } },
      { code: { contains: keyword } },
      { casNumber: { contains: keyword } },
    ];
  }

  const canSeeMaterialDetail = auth.permissions.includes('reagent_materials.view');
  const canSeeFormulaDetail = auth.permissions.includes('formulas.view');

  const [total, materials] = await Promise.all([
    prisma.reagentMaterial.count({ where }),
    prisma.reagentMaterial.findMany({
      where,
      skip,
      take,
      orderBy: { commonName: 'asc' },
      include: {
        lots: { where: { status: { in: ['AVAILABLE', 'RESERVED'] } } },
        components: {
          include: { formula: { select: { id: true, code: true, name: true, type: true, status: true } } },
        },
      },
    }),
  ]);

  const list = materials.map((m) => {
    const usedInFormulas = m.components
      .map((comp) => comp.formula)
      .filter((f) => f && f.status !== null);
    const uniqueFormulas = [...new Map(usedInFormulas.map((f) => [f.id, f])).values()];
    return {
      id: m.id,
      code: m.code,
      commonName: m.commonName,
      chineseName: m.chineseName,
      englishName: m.englishName,
      category: m.category,
      casNumber: m.casNumber,
      state: m.state,
      status: m.status,
      updatedAt: m.updatedAt,
      // 库存聚合（来自 reagent_lots）
      inventory: lotAggregates(m.lots),
      lots: canSeeMaterialDetail
        ? m.lots.map((l) => ({ id: l.id, lotNo: l.lotNo, quantity: l.quantity, unit: l.unit, status: l.status, expiryDate: l.expiryDate }))
        : null,
      // 原料明细字段：无权限时置 null，key 保留
      materialDetail: canSeeMaterialDetail
        ? {
          molecularFormula: m.molecularFormula,
          molecularWeight: m.molecularWeight,
          purity: m.purity,
          density: m.density,
          hazardLevel: m.hazardLevel,
          supplier: m.supplier,
          storageCondition: m.storageCondition,
        }
        : null,
      // 配方引用：无权限时置 null，key 保留
      usedInFormulas: canSeeFormulaDetail ? uniqueFormulas : null,
      formulaCount: uniqueFormulas.length,
    };
  });

  return c.json({ ...paged(list, total, { page, pageSize }), list });
});

// ── 聚合详情 ─────────────────────────────────────────────────────────────────
reagents.get('/:id', requirePermission('reagents.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const material = await prisma.reagentMaterial.findUnique({
    where: { id },
    include: {
      lots: { orderBy: { createdAt: 'desc' } },
      components: {
        include: { formula: { select: { id: true, code: true, name: true, type: true, status: true } } },
      },
    },
  });
  if (!material) throw notFound('REAGENT_NOT_FOUND', '试剂不存在');

  const canSeeMaterialDetail = auth.permissions.includes('reagent_materials.view');
  const canSeeFormulaDetail = auth.permissions.includes('formulas.view');
  const uniqueFormulas = [...new Map(
    material.components.map((comp) => comp.formula).filter(Boolean).map((f) => [f.id, f]),
  ).values()];

  return c.json({
    id: material.id,
    code: material.code,
    commonName: material.commonName,
    chineseName: material.chineseName,
    englishName: material.englishName,
    category: material.category,
    casNumber: material.casNumber,
    state: material.state,
    status: material.status,
    inventory: lotAggregates(material.lots),
    lots: canSeeMaterialDetail
      ? material.lots.map((l) => ({
        id: l.id, lotNo: l.lotNo, quantity: l.quantity, unit: l.unit,
        status: l.status, expiryDate: l.expiryDate, location: l.location,
      }))
      : null,
    materialDetail: canSeeMaterialDetail
      ? {
        molecularFormula: material.molecularFormula,
        molecularWeight: material.molecularWeight,
        purity: material.purity,
        density: material.density,
        hazardLevel: material.hazardLevel,
        supplier: material.supplier,
        storageCondition: material.storageCondition,
        notes: material.notes,
      }
      : null,
    usedInFormulas: canSeeFormulaDetail ? uniqueFormulas : null,
    formulaCount: uniqueFormulas.length,
  });
});

// ── 导出（P0 唯一出口；POST 与 GET 均受理，均需 reagents.export）────────────
async function exportData(c) {
  const auth = getAuth(c);
  const rows = await prisma.reagentMaterial.findMany({
    orderBy: { commonName: 'asc' },
    include: { lots: true },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: 'REAGENT',
    metadata: { permissionCode: 'reagents.export', count: rows.length },
  });
  return c.json({
    exportedAt: new Date().toISOString(),
    count: rows.length,
    items: rows.map((m) => ({
      code: m.code,
      commonName: m.commonName,
      chineseName: m.chineseName,
      category: m.category,
      casNumber: m.casNumber,
      inventory: lotAggregates(m.lots),
    })),
  });
}

reagents.get('/export', requirePermission('reagents.export'), exportData);
reagents.post('/export', requirePermission('reagents.export'), exportData);

export default reagents;
