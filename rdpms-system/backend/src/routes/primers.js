import { Hono } from 'hono';
import { prisma } from '../index.js';

const router = new Hono();

// GET /api/primers — 列表（支持 keyword / projectName / targetGene / status 过滤）
router.get('/', async (c) => {
  try {
    const { keyword, projectName, targetGene, status, page = '1', pageSize = '100' } = c.req.query();
    const where = {};
    if (status) where.status = status;
    if (projectName) where.projectName = { contains: projectName };
    if (targetGene) where.targetGene = { contains: targetGene };
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { sequence: { contains: keyword } },
        { targetGene: { contains: keyword } },
        { projectName: { contains: keyword } },
        { speciesChineseName: { contains: keyword } },
        { speciesLatinName: { contains: keyword } },
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const [list, total] = await Promise.all([
      prisma.primer.findMany({
        where,
        orderBy: [{ projectName: 'asc' }, { name: 'asc' }],
        skip,
        take: parseInt(pageSize),
      }),
      prisma.primer.count({ where }),
    ]);
    return c.json({ success: true, list, total });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/primers/:id
router.get('/:id', async (c) => {
  try {
    const primer = await prisma.primer.findUnique({ where: { id: c.req.param('id') } });
    if (!primer) return c.json({ error: '未找到' }, 404);
    return c.json(primer);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /api/primers
router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const primer = await prisma.primer.create({
      data: {
        projectName:        body.projectName || null,
        name:               body.name,
        sequence:           body.sequence,
        targetGene:         body.targetGene || null,
        modification5:      body.modification5 || null,
        modification3:      body.modification3 || null,
        ampliconLength:     body.ampliconLength ? parseInt(body.ampliconLength) : null,
        speciesLatinName:   body.speciesLatinName || null,
        speciesChineseName: body.speciesChineseName || null,
        speciesTaxid:       body.speciesTaxid || null,
        atccStrain:         body.atccStrain || null,
        validatedStrain:    body.validatedStrain || null,
        synthesisAmount:    body.synthesisAmount || null,
        synthesisCompany:   body.synthesisCompany || null,
        tubeCount:          body.tubeCount ? parseInt(body.tubeCount) : null,
        notes:              body.notes || null,
        status:             body.status || 'active',
        createdBy:          body.createdBy || null,
      },
    });
    return c.json({ success: true, data: primer }, 201);
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

// PUT /api/primers/:id
router.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const primer = await prisma.primer.update({
      where: { id },
      data: {
        projectName:        body.projectName ?? undefined,
        name:               body.name ?? undefined,
        sequence:           body.sequence ?? undefined,
        targetGene:         body.targetGene ?? undefined,
        modification5:      body.modification5 ?? undefined,
        modification3:      body.modification3 ?? undefined,
        ampliconLength:     body.ampliconLength !== undefined ? (body.ampliconLength ? parseInt(body.ampliconLength) : null) : undefined,
        speciesLatinName:   body.speciesLatinName ?? undefined,
        speciesChineseName: body.speciesChineseName ?? undefined,
        speciesTaxid:       body.speciesTaxid ?? undefined,
        atccStrain:         body.atccStrain ?? undefined,
        validatedStrain:    body.validatedStrain ?? undefined,
        synthesisAmount:    body.synthesisAmount ?? undefined,
        synthesisCompany:   body.synthesisCompany ?? undefined,
        tubeCount:          body.tubeCount !== undefined ? (body.tubeCount ? parseInt(body.tubeCount) : null) : undefined,
        notes:              body.notes ?? undefined,
        status:             body.status ?? undefined,
      },
    });
    return c.json({ success: true, data: primer });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

// DELETE /api/primers/:id
router.delete('/:id', async (c) => {
  try {
    await prisma.primer.delete({ where: { id: c.req.param('id') } });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

// POST /api/primers/batch-import — CSV 批量导入（前端解析 CSV 后传数组）
router.post('/batch-import', async (c) => {
  try {
    const { rows } = await c.req.json();
    if (!Array.isArray(rows) || rows.length === 0) return c.json({ error: '无数据' }, 400);
    const created = await prisma.$transaction(
      rows.map((r) =>
        prisma.primer.create({
          data: {
            projectName:        r.projectName || null,
            name:               r.name || '',
            sequence:           r.sequence || '',
            targetGene:         r.targetGene || null,
            modification5:      r.modification5 || null,
            modification3:      r.modification3 || null,
            ampliconLength:     r.ampliconLength ? parseInt(r.ampliconLength) : null,
            speciesLatinName:   r.speciesLatinName || null,
            speciesChineseName: r.speciesChineseName || null,
            speciesTaxid:       r.speciesTaxid || null,
            atccStrain:         r.atccStrain || null,
            validatedStrain:    r.validatedStrain || null,
            synthesisAmount:    r.synthesisAmount || null,
            synthesisCompany:   r.synthesisCompany || null,
            tubeCount:          r.tubeCount ? parseInt(r.tubeCount) : null,
            notes:              r.notes || null,
            status:             'active',
            createdBy:          r.createdBy || null,
          },
        })
      )
    );
    return c.json({ success: true, count: created.length });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

export default router;
