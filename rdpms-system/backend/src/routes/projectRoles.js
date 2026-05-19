import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = new Hono();

// 获取模板的角色定义列表
app.get('/templates/:templateId/roles', async (c) => {
  try {
    const { templateId } = c.req.param();
    const roles = await prisma.projectRoleDefinition.findMany({
      where: { templateId },
      orderBy: { sortOrder: 'asc' },
    });
    return c.json({ roles });
  } catch (err) {
    console.error('Failed to get template roles:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 创建新角色
app.post('/templates/:templateId/roles', async (c) => {
  try {
    const { templateId } = c.req.param();
    const body = await c.req.json();
    
    const role = await prisma.projectRoleDefinition.create({
      data: {
        templateId,
        name: body.name,
        description: body.description,
        permissions: body.permissions,
        sortOrder: body.sortOrder || 0,
      },
    });
    
    return c.json({ role }, 201);
  } catch (err) {
    console.error('Failed to create role:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 更新角色
app.put('/templates/:templateId/roles/:roleId', async (c) => {
  try {
    const { templateId, roleId } = c.req.param();
    const body = await c.req.json();
    
    const role = await prisma.projectRoleDefinition.update({
      where: { id: roleId },
      data: {
        name: body.name,
        description: body.description,
        permissions: body.permissions,
        sortOrder: body.sortOrder,
      },
    });
    
    return c.json({ role });
  } catch (err) {
    console.error('Failed to update role:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 删除角色
app.delete('/templates/:templateId/roles/:roleId', async (c) => {
  try {
    const { roleId } = c.req.param();
    await prisma.projectRoleDefinition.delete({
      where: { id: roleId },
    });
    return c.json({ success: true });
  } catch (err) {
    console.error('Failed to delete role:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 批量设置角色（用于模板编辑时一次性保存所有角色）
app.post('/templates/:templateId/roles/batch', async (c) => {
  try {
    const { templateId } = c.req.param();
    const body = await c.req.json();
    const { roles } = body;

    // 删除现有的所有角色
    await prisma.projectRoleDefinition.deleteMany({
      where: { templateId },
    });

    // 创建新的角色
    const createdRoles = await Promise.all(
      (roles || []).map((role, index) =>
        prisma.projectRoleDefinition.create({
          data: {
            templateId,
            name: role.name,
            description: role.description,
            permissions: role.permissions,
            sortOrder: index,
          },
        })
      )
    );

    return c.json({ roles: createdRoles }, 201);
  } catch (err) {
    console.error('Failed to batch set roles:', err);
    return c.json({ error: err.message }, 500);
  }
});

export default app;
