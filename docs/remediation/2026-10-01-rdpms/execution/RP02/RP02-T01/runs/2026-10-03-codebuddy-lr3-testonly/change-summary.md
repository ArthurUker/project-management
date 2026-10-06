# RP02-T01 TEST_ONLY — 固化「条件更新前停用」屏障（OBS-RP02-FENCE）

- 任务：RP02-T01（TEST_ONLY，未改任何业务代码）；关联历史发现：B14
- 执行者：CodeBuddy；日期：2026-10-03（session 2026-10-03b）；run：2026-10-03-codebuddy-lr3-testonly
- 依据：独立复核（execution/reviews/2026-10-03-codebuddy/）已用探针证明当前条件更新实现正确，并建议迁入正式回归。

## 新增用例（C01）

`rdpms-system/backend/tests/integration/rp02-login-lock-ttl.integration.test.mjs` 追加一个用例：

1. 夹具有效性：同类合成 ACTIVE 账号先真实登录成功 → 断言 accessToken、expiresIn 与 JWT exp 对应、
   refreshToken(revokedAt=null)=1、auditLog(action='login')=1；
2. 屏障位置：目标账号登录已读到 ACTIVE、真实 bcrypt 校验通过，屏障停在带 lastLoginAt 重置的实际
   user.updateMany 执行之前（不是 findFirst 之前）；暂停期间读库确认行仍 ACTIVE 且 lastLoginAt 未写；
3. 管理员先提交：真实持久管理员 actor 经 PATCH /api/users/:id/status 停用 → 200，行 DISABLED，status.change 审计 1 条；
4. 放行登录：条件更新失败 → 403 ACCOUNT_DISABLED，无 accessToken、无 refreshToken、无成功登录审计；
   行保持 DISABLED，lastLoginAt/失败计数/lockedUntil 未被这次被拒登录改变；
5. finally 释放屏障，避免挂起事务或孤儿请求。

## 保留的既有用例（未删未改）

入口读前停用方向、登录先完成方向、账号状态/期限/TTL（阈值上锁、PENDING_ACTIVATION、到期恢复、未来锁与手工锁、
DISABLED、成功清理计数、并发失败计数）以及上一轮补的锁内正确/错误密码断言。合计 12 个用例（原有 11 + 新增 1），全部通过。

## 边界

未修改 auth.js / users.js / RBAC / session-refresh 策略；未实施追溯会话撤销、激活、账号等级或强制改密政策。
管理员为注入的可信 actor（真实 DB 合成用户行），非完整 JWT 链验收。
