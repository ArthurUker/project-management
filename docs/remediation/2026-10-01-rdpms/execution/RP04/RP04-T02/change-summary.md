# RP04-T02 — 项目创建聚合事务、严格审计与幂等

## 状态

- 子任务：`implementation COMPLETE`；`validation ENV_BLOCKED`；`release NOT_EVALUATED`。
- 关联旧发现：B18（P1）仍为 `SUPPORTED`，尚未 `FIX_ACCEPTED`。
- 原始审计基线与当前 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本任务开始时 HEAD 相同；项目路由已有 RP04-T01 未提交差异，任务开始源码 SHA-256 为 `28dd72cc9cd1ab6b07b167d2ffc2c5d94c4158b9916018f287e52adb4c3b618e`，任务后 SHA-256 为 `e5e8a43d50a18c0be25b9374887bcad7b8790f8fea3f994451dfc21ec6897030`。本任务相对 RP04-T01 起点的差异见 `evidence/source-diff.patch`。

## 实施差异

在 `projects.post('/')` 中先校验创建 DTO、日期、任务/里程碑枚举、阶段引用和用户引用；然后通过现有 `withIdempotency` 将项目编号、项目与成员、阶段、任务、里程碑、`writeAuditStrict` 及 receipt 写入纳入同一个 Prisma 事务。sequence 使用事务客户端。带相同 actor/command/resource/key 和相同内容的重试按现有回执合同回放；成功响应仍为 HTTP 201 和项目对象，重放时增加 `Idempotency-Replayed: true` 响应头。

新增真实 PostgreSQL 集成场景覆盖成功聚合、同键回放，以及 task、sequence、audit、receipt 故障注入后的事务回滚断言。场景已编写，因构建环境受阻未执行，不构成运行证据。

## 影响边界

- API 成功响应结构及 201 状态保持；增加可选幂等请求支持与重放响应头。
- 无数据库 schema 或 migration 变化；未改公共 sequence、audit、receipt helper。
- 无角色/账号/权限政策变化。认证及 `projects.create` 授权仍由原路由中间件在 receipt 查找之前执行。
- 旧式无幂等键调用仍执行事务，但不去重，这是现有 helper 的兼容行为。
- receipt TTL 沿用现有 24 小时实现；PC03 / T-RP-02 业务合同仍未获批准，本任务没有改变该 helper 的保留或恢复策略。

## 验收限制

当前 `backend/.env` 存在，但未读取或用于验证；专用测试守卫只读取仓库根目录 `.env.test.local` 或显式 `RDPMS_TEST_ENV_FILE`。仓库根测试环境文件、环境变量 `DATABASE_URL`/`TEST_DATABASE_URL`、本地 TypeScript compiler 均缺失。`npm run build` 退出 127（`tsc: command not found`）；无构建产物，故集成测试未运行、未连接数据库、未创建触发器/夹具。动态 AC/PAC 均保留 `ENV_BLOCKED`，`INT-PC03-01` 保持 `NOT_RUN`，不得据测试代码标注修复验收通过。
