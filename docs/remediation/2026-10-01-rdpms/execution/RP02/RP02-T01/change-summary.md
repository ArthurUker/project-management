# RP02-T01 — 临时锁与 access TTL

## 状态

- 实现：COMPLETE（仅该子任务代码）；验收：ENV_BLOCKED；发布：NOT_EVALUATED。
- 原始审计基线与当前 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。
- 本轮源码差异仅涉及 `backend/src/routes/auth.js`、`backend/src/kernel/rbac.js` 和新建的 RP02 集成测试；未修改 Prisma schema/迁移/依赖、refresh 单次消费或family策略。

## 修改

- 临时账号锁仍在 `lockedUntil` 未来时拒绝。`LOCKED` 且截止时间已过的行可通过正确密码登录后重置失败次数/时间并恢复 `ACTIVE`；没有截止时间的 `LOCKED` 保持拒绝。`DISABLED` 始终先行拒绝，不会因为过期锁字段被启用。
- 登录失败次数改为数据库事务中的原子增量；只有未禁用且没有尚未过期锁的尝试参与计数，达到五次后写入 `LOCKED` 与15分钟截止时间。已因并发锁定而变为过期状态的请求不会继续递增或延长锁。
- 导出 access JWT 剩余期限计算 helper；login 和 refresh 的 `expiresIn` 按该响应时 JWT `exp` 的剩余秒数返回，删除固定7200秒值。refresh 轮换/CAS/family 逻辑本身未改，属于 RP02-T02。
- 新集成测试覆盖第五次失败、并发计数、过期锁正确凭据恢复、未来/无期限锁、DISABLED、成功清零及 login/refresh TTL。

## 验证限制

源码语法检查和 `git diff --check` 通过。`npm run build` 因缺少 `tsc` 退出127；当前无 `dist/bootstrap/createApp.js`，故真实API/隔离PostgreSQL测试未运行，标 ENV_BLOCKED。没有用 mock 或源码检查代替持久化验收。详细命令和结果见 `evidence/commands-and-results.json`。

## 回滚

无数据库schema变化。精确修改差异已保存在 `evidence/source-diff.patch`，修改前/后的文件摘要见 `evidence/source-digest-comparison.json`。确认没有后续依赖后，可审阅该patch并仅逆转本任务的两个源文件改动；不要 reset/checkout 整文件，以免覆盖后续修改。新测试文件可单独移除。当前工作区其他角色DTO与文档变化必须保留。
