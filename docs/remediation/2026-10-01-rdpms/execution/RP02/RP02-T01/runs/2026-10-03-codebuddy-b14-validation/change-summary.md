# RP02-T01 补验 — 登录锁 / 管理员停用双方向屏障与锁内密码断言

- 任务：RP02-T01（VALIDATION_ONLY，未改业务代码）；复核发现：LR2-04（P2 证据）；关联历史发现：B14
- 执行者：CodeBuddy；日期：2026-10-03；run：`2026-10-03-codebuddy-b14-validation`
- 源码基线：HEAD `138cf2d` + 本轮开始前工作区未提交改动（本任务**未修改任何业务源文件**）
- 门禁：T-RP-09 仍 PROPOSED（未批准）；本任务只做 RP02-T01 自身范围的验证，不涉及 refresh/family/等级/强制改密

## 复核要求与处置

| 复核指出 | 本次处置 |
|---|---|
| 只测事先 DISABLED，没有并发 disable 屏障 | 新增方向 1（停用先提交 → 登录被拒）与方向 2（登录条件写入先提交 → 合法更早成功，后续登录被拒），均为确定性屏障 |
| 未来锁仅正确密码，没有锁内 wrong-password 持久计数/到期不变断言 | 新增两条：有效定时锁内正确密码、错误密码，均断言 `failedLoginAttempts` 与 `lockedUntil`（毫秒级）不变，且不发令牌 |
| 缺少响应/真实用户/refreshToken/audit 核对 | 四个新用例均核对 HTTP 状态与 code、真实 users 行、refreshToken 计数、审计行（登录/登录成功/停用） |
| 需明确操作线性化点 | 写在测试文件头注释与 `change-summary`，并按该线性化点设计断言（不要求任意交错都拒绝已完成的合法登录） |

## 实际变更（仅测试文件）

`rdpms-system/backend/tests/integration/rp02-login-lock-ttl.integration.test.mjs`（既有 7 个用例全部保留）：

- 新增 `gateOn(db, { method, matches })`：只在指定 ORM 方法与参数上暂停一次（`user.findFirst` / `user.update`），路由、事务、SQL 照常执行；用于确定性交错，不使用 sleep 猜测顺序。
- 新增 `makeTargetUser` / `makeAdminUser` / `makeBarrierApp` / `loginAs` / `disableAsAdmin`：合成用户与管理端 `PATCH /api/users/:id/status`（真实路由，要求 `users.disable`）。
- 新增 4 个用例（见上表）。

## 记录下来的线性化点（语义未改）

- 登录**成功**：`user.updateMany`（按当前 status/锁条件重置登录状态）提交成功；若停用先提交，该条件不再匹配 → 403 `ACCOUNT_DISABLED`。
- 登录**拒绝**：入口状态读（DISABLED / 有效定时锁）即该请求判定点。
- 管理员停用：`PATCH /api/users/:id/status` 的 `user.update` 提交成功。
- 方向 2 中登录先于停用提交 → 合法的更早成功，**不追溯撤销**；停用不吊销已发 refreshToken（属 RP02-T02 / T-RP-09 会话家族政策，本任务不触碰，已在用例中断言并注明归属）。

## 限制

- 管理员身份为注入的可信 actor（真实 DB 合成用户，非 JWT 链）；未运行前端 IndexedDB、目标环境与部署验收；release 仍 NOT_EVALUATED。
- 本任务**未新增业务修复**；B14 仍 SUPPORTED / 未 FIX_ACCEPTED。
