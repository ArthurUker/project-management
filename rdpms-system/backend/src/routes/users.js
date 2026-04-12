import { Hono } from 'hono';
import { prisma } from '../index.js';
import pkg from 'bcryptjs';
const bcrypt = pkg;
import { authMiddleware, adminMiddleware } from './auth.js';

const users = new Hono();

// 所有用户路由需要登录
users.use('*', authMiddleware);

// 获取用户列表
users.get('/', async (c) => {
  const { page = 1, pageSize = 50, department, role, status } = c.req.query();
  
  const where = {};
  if (department) where.department = department;
  if (role) where.role = role;
  if (status) where.status = status;
  
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        position: true,
        department: true,
        role: true,
        status: true,
        avatar: true,
        createdAt: true
      }
    })
  ]);
  
  return c.json({
    list: users,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

// 获取单个用户
users.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      position: true,
      department: true,
      role: true,
      status: true,
      avatar: true,
      createdAt: true,
      // 关联的项目
      projectMembers: {
        include: {
          project: {
            select: { id: true, name: true, code: true }
          }
        }
      },
      // 管理的项目
      managedProjects: {
        select: { id: true, name: true, code: true }
      }
    }
  });
  
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  
  return c.json(user);
});

// 创建用户（管理员）
users.post('/', adminMiddleware, async (c) => {
  const { username, password, name, position, department, role } = await c.req.json();
  
  if (!username || !password || !name) {
    return c.json({ error: '用户名、密码、姓名不能为空' }, 400);
  }
  
  // 检查用户名唯一
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return c.json({ error: '用户名已存在' }, 400);
  }
  
  const hashed = await bcrypt.hash(password, 10);
  
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      name,
      position: position || '',
      department: department || '',
      role: role || 'member'
    },
    select: {
      id: true,
      username: true,
      name: true,
      position: true,
      department: true,
      role: true,
      status: true,
      createdAt: true
    }
  });
  
  // 记录日志
  const adminId = c.get('userId');
  await prisma.systemLog.create({
    data: {
      action: 'user_create',
      userId: adminId,
      targetId: user.id,
      detail: `创建用户: ${name} (${username})`
    }
  });
  
  return c.json(user, 201);
});

// 更新用户
users.put('/:id', async (c) => {
  const id = c.req.param('id');
  const currentUserId = c.get('userId');
  const currentRole = c.get('userRole');
  
  const body = await c.req.json();
  
  // 非管理员只能修改自己的信息
  if (currentRole !== 'admin' && currentUserId !== id) {
    return c.json({ error: '无权修改其他用户信息' }, 403);
  }
  
  // 非管理员不能修改角色
  if (currentRole !== 'admin') {
    delete body.role;
    delete body.status;
  }
  
  // 不能修改密码（使用单独接口）
  delete body.password;
  delete body.username;
  
  const user = await prisma.user.update({
    where: { id },
    data: body,
    select: {
      id: true,
      username: true,
      name: true,
      position: true,
      department: true,
      role: true,
      status: true,
      avatar: true,
      createdAt: true
    }
  });
  
  return c.json(user);
});

// 重置密码（管理员）
users.put('/:id/reset-password', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const { newPassword } = await c.req.json();
  
  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: '密码长度不能少于6位' }, 400);
  }
  
  const hashed = await bcrypt.hash(newPassword, 10);
  
  await prisma.user.update({
    where: { id },
    data: { password: hashed }
  });
  
  return c.json({ success: true });
});

// 删除用户（管理员）
users.delete('/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  
  // 不能删除自己
  const currentUserId = c.get('userId');
  if (id === currentUserId) {
    return c.json({ error: '不能删除自己' }, 400);
  }
  
  await prisma.user.delete({ where: { id } });
  
  return c.json({ success: true });
});

// 批量导入用户（管理员）
users.post('/batch', adminMiddleware, async (c) => {
  const { users: userList } = await c.req.json();
  
  if (!Array.isArray(userList) || userList.length === 0) {
    return c.json({ error: '用户列表不能为空' }, 400);
  }
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const item of userList) {
    try {
      const { username, password, name, position, department } = item;
      
      if (!username || !password || !name) {
        results.failed.push({ username, reason: '缺少必填字段' });
        continue;
      }
      
      const exists = await prisma.user.findUnique({ where: { username } });
      if (exists) {
        results.failed.push({ username, reason: '用户名已存在' });
        continue;
      }
      
      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          username,
          password: hashed,
          name,
          position: position || '',
          department: department || '',
          role: 'member'
        }
      });
      
      results.success.push({ id: user.id, username, name });
    } catch (err) {
      results.failed.push({ username: item.username, reason: err.message });
    }
  }
  
  return c.json(results);
});

export default users;
