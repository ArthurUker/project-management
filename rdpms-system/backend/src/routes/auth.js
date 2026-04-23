import { Hono } from 'hono';
import { prisma } from '../index.js';
import pkg from 'bcryptjs';
const bcrypt = pkg;
import pkg2 from 'jsonwebtoken';
const jwt = pkg2;

const auth = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || 'rdpms-jwt-secret';

// 角色权限映射 — 与前端 permissions.ts 保持一致
const ROLE_PERMISSIONS = {
  admin: [
    'projects.create','projects.edit','projects.delete',
    'projects.update_status','projects.manage_members',
    'tasks.create','tasks.update_status','tasks.delete',
    'users.manage','templates.create','templates.edit',
  ],
  manager: [
    'projects.create','projects.edit',
    'projects.update_status','projects.manage_members',
    'tasks.create','tasks.update_status','tasks.delete',
    'templates.edit',
  ],
  member: [
    'tasks.create','tasks.update_status',
  ],
};

// 中间件：验证Token
export const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', code: 401 }, 401);
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    c.set('userId', decoded.userId);
    c.set('userRole', decoded.role);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token', code: 401 }, 401);
  }
};

// 管理员中间件
export const adminMiddleware = async (c, next) => {
  const role = c.get('userRole');
  if (role !== 'admin') {
    return c.json({ error: 'Forbidden: Admin only', code: 403 }, 403);
  }
  await next();
};

// 登录
auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    
    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400);
    }
    
    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username }
    });
    
    if (!user) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }
    
    // 检查账号状态
    if (user.status !== 'active') {
      return c.json({ error: '账号已被禁用，请联系管理员' }, 403);
    }
    
    // 验证密码
    const valid = await bcrypt.compare(password, user.password);
    
    if (!valid) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }
    
    // 生成Token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // 记录登录日志
    await prisma.systemLog.create({
      data: {
        action: 'login',
        userId: user.id,
        ip: c.req.header('X-Forwarded-For') || 'unknown'
      }
    });
    
    // 返回用户信息（不含密码）
    const { password: _, ...userInfo } = user;
    const permissions = ROLE_PERMISSIONS[user.role] ?? [];
    
    return c.json({
      token,
      user: { ...userInfo, permissions }
    });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: '登录失败' }, 500);
  }
});

// 验证Token
auth.post('/verify', authMiddleware, async (c) => {
  const userId = c.get('userId');
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true
    }
  });
  
  if (!user || user.status !== 'active') {
    return c.json({ error: '用户不存在或已禁用' }, 401);
  }
  
  const permissions = ROLE_PERMISSIONS[user.role] ?? [];
  return c.json({ valid: true, user: { ...user, permissions } });
});

// 登出
auth.post('/logout', authMiddleware, async (c) => {
  const userId = c.get('userId');
  
  await prisma.systemLog.create({
    data: {
      action: 'logout',
      userId,
      ip: c.req.header('X-Forwarded-For') || 'unknown'
    }
  });
  
  return c.json({ success: true });
});

// 获取当前用户信息
auth.get('/profile', authMiddleware, async (c) => {
  const userId = c.get('userId');
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      position: true,
      department: true,
      role: true,
      avatar: true,
      createdAt: true
    }
  });
  
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  
  return c.json(user);
});

// 修改密码
auth.put('/password', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { oldPassword, newPassword } = await c.req.json();
  
  if (!oldPassword || !newPassword) {
    return c.json({ error: '旧密码和新密码不能为空' }, 400);
  }
  
  if (newPassword.length < 6) {
    return c.json({ error: '新密码长度不能少于6位' }, 400);
  }
  
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  const valid = await bcrypt.compare(oldPassword, user.password);
  if (!valid) {
    return c.json({ error: '旧密码错误' }, 400);
  }
  
  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed }
  });
  
  return c.json({ success: true });
});

export default auth;
