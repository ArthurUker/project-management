/**
 * 密码策略（前端唯一事实来源）——必须与后端合同一致，禁止各页自行发明数值。
 *
 * 服务端实现（三处同一规则：长度 ≥ 12 且不含弱口令黑名单子串）：
 *   - 创建用户  backend/src/routes/users.js   POST /api/users
 *   - 重置密码  backend/src/routes/users.js   PUT  /api/users/:id/reset-password
 *   - 修改密码  backend/src/routes/auth.js    PUT  /api/auth/password[/force]
 *
 * 背景（实机缺陷，2026-10-12）：成员管理弹窗提示「至少6位」、系统设置按 6 位校验，
 * 均与服务端 12 位合同不一致 → 用户填 6 位必然 400；且页面把后端原因吞成「操作失败」，
 * 用户拿不到「长度不能少于 12 位」这类可操作的提示。
 */

/** 与后端一致的密码最小长度 */
export const PASSWORD_MIN_LENGTH = 12;

/** 与后端一致的弱口令黑名单（命中子串即拒绝，勿单独修改，需同步后端） */
export const WEAK_PASSWORD_BLACKLIST = [
  'admin123',
  '123456',
  'please-change',
  'password',
  'admin',
  'changeme',
  'test1234',
] as const;

/** 输入框占位提示（各页统一引用，避免再次漂移） */
export const PASSWORD_HINT = `至少 ${PASSWORD_MIN_LENGTH} 位，勿含弱口令`;

/**
 * 校验密码是否满足服务端合同（长度 + 弱口令黑名单）。
 * 只做「服务端一定会拒绝」的前置拦截，不额外发明更强的规则。
 *
 * @returns 违规时返回可直接展示给用户的中文文案；通过时返回 null。
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) return '请填写密码';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 位`;
  }
  const lower = password.toLowerCase();
  if (WEAK_PASSWORD_BLACKLIST.some((w) => lower.includes(w))) {
    return '密码命中弱口令黑名单，请换一个（如 admin、123456、password 等）';
  }
  return null;
}
