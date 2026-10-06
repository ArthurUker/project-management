# RP01-T01 — B17 角色创建 DTO

- 任务状态：implementation COMPLETE；local validation PASS；`B17 FIX_ACCEPTED`（本地隔离环境）。目标环境 acceptance NOT_RUN；release NOT_EVALUATED；未提交、未部署。RP01 整包仍 IN_PROGRESS，B01 仍未处置。
- 原审计基线 / 本轮起始及结束 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`（无提交）。角色路由新 SHA-256：`23fd46e81ddb865ead2006116b492ee086eb0218b45ff5dfa8a6d53db38a6765`；新增测试 SHA-256：`49e195536a265c2c43241305f1632360c031db51c5a4b8848fa1a5ecefd411c3`。
- 修改业务源：`rdpms-system/backend/src/routes/roles.js`；新增定向验收：`rdpms-system/backend/tests/integration/b17-role-create.integration.test.mjs`。
- 角色创建命令专属解析从请求中隔离 `code`，仍用全局 `pickAllowed` 检查其余请求字段；额外明确拒绝角色关系和 server-owned 的 `isSystem`/`sortOrder` 等字段。全局 `GLOBAL_FORBIDDEN_FIELDS`（包括 `code`）和 mass-assignment helper 保持原样。
- API/数据库 schema、seed、权限绑定策略、用户账号等级、强制改密、重置密码和会话策略均未更改；没有业务数据库迁移或依赖升级。生成了当前 Prisma schema 对应的本地 ignored Prisma Client（v5.22.0），解决旧生成物与 schema 的 EntityType 不一致。
- 有效合成 SUPER_ADMIN 登录及 `roles.create` 授权先通过，然后 HTTP 创建合法角色、重复/非法 code 拒绝、13类 id/关系/审计/系统字段拒绝；断言真实数据库持久行、`isSystem=false`、服务端 createdById、无权限关联与审计记录。5 个关联验收全部通过。
- 完整 backend build `npm run build` 退出127：现有 `node_modules` 缺少 `tsc`。因此没有 full `dist`/`createApp` 候选验证；本次实际 HTTP 测试挂载真实 auth 与 roles 路由模块，使用真实 JWT 与隔离 PostgreSQL，不使用 mocks。
- 测试后只剩 immutable 临时 ROLE audit entries（无 B17 角色/权限关联）；随后整个隔离数据库和集群均已销毁。
