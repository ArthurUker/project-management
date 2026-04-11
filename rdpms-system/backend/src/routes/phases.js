import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware, adminMiddleware } from './auth.js';

const phases = new Hono();
phases.use('*', authMiddleware);

// 建立阶段流转
phases.post('/:id/transitions', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const toPhaseId = body.toPhaseId;

  if (!toPhaseId) return c.json({ success: false, error: 'toPhaseId is required' }, 400);
  if (id === toPhaseId) return c.json({ success: false, error: '不能自引用' }, 400);

  // 检查循环依赖（简单双向检测）
  const circular = await prisma.phaseTransition.findFirst({ where: { fromPhaseId: toPhaseId, toPhaseId: id } });
  if (circular) return c.json({ success: false, error: '检测到循环依赖' }, 400);

  try {
    const transition = await prisma.phaseTransition.upsert({
      where: { fromPhaseId_toPhaseId: { fromPhaseId: id, toPhaseId } },
      update: {},
      create: {
        id: `pt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        fromPhaseId: id,
        toPhaseId,
      }
    });
    return c.json({ success: true, data: transition });
  } catch (e) {
    console.error('create/upsert phase transition error', e);
    return c.json({ success: false, error: e.message || '创建失败' }, 500);
  }
});

// 删除阶段流转
phases.delete('/:id/transitions/:toPhaseId', async (c) => {
  const id = c.req.param('id');
  const toPhaseId = c.req.param('toPhaseId');
  try {
    await prisma.phaseTransition.deleteMany({ where: { fromPhaseId: id, toPhaseId } });
    return c.json({ success: true });
  } catch (e) {
    console.error('delete phase transition error', e);
    return c.json({ success: false, error: e.message || '删除失败' }, 500);
  }
});

export default phases;
