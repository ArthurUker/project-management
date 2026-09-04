import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate } from '../kernel/rbac.js';

/**
 * /api/dict —— 枚举展示字典。
 * 权限：登录即可（无需独立权限点，M-1 否决清单）。
 */
const dict = new Hono();

dict.use('*', authenticate);

function toItem(row) {
  return {
    enumName: row.enumName,
    value: row.code,
    code: row.code,
    label: row.label,
    color: row.color,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault,
    isEnabled: row.isEnabled,
  };
}

dict.get('/', async (c) => {
  const rows = await prisma.enumMeta.findMany({
    where: { isEnabled: true },
    orderBy: [{ enumName: 'asc' }, { sortOrder: 'asc' }],
  });
  const enums = {};
  for (const row of rows) {
    (enums[row.enumName] ??= []).push(toItem(row));
  }
  return c.json({ enums });
});

dict.get('/:enumName', async (c) => {
  const rows = await prisma.enumMeta.findMany({
    where: { enumName: c.req.param('enumName'), isEnabled: true },
    orderBy: { sortOrder: 'asc' },
  });
  return c.json(rows.map(toItem));
});

export default dict;
