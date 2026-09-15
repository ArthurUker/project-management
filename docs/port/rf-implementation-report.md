# RDPMS 重构与实验指导实施包 v2 —— 实施与验收报告

方案来源：`RDPMS_重构与实验指导实施包_v2.zip`（2026-09-15）。
执行顺序依据 `06_重构任务与发布门禁.md`（先 RF 基础修复 → RF 一致性与领域重构 → 实验指导闭环）。
交付格式依据 `06`「每个任务的AI交付格式」。

工作分支：`refactor/rdpms-guidance-v2`（自 `integrate/tencent-feature-port` @ `bf04495` 创建，保留原工作区改动）。

---

## 0. 基线与差异核对（03_编码AI启动提示词 第一步）

| 项目 | 结果 |
|---|---|
| 仓库 | `/mnt/datadisk0/rdpms/work/rdpms-port`（`github.com:ArthurUker/project-management`） |
| 基分支 / 基线 | `integrate/tencent-feature-port` / `bf04495b1599f1edd895e7c5a624bf6248bb53e8` |
| 基线差异 | `git rev-list --left-right --count bf04495...HEAD` = **0 0** |
| AGENTS.md | **仓库内不存在**，无可适用仓库级 Agent 约定 |
| 诊断脚本 | 修复前运行 `evidence/reproduce.mjs`，R01～R08 全部复现（仅作旧行为证据，不计入修复 PASS） |

---

## 1. 测试层次与命令契约（用户要求：明确区分四类检查）

| 层次 | 命令（backend） | 是否连数据库 | 是否阻断合并 | 说明 |
|---|---|---|---|---|
| ① 未定义标识符检查 | `npm run lint:undefined` | 否 | **是** | 只判定 TS2304/2552 与语法错误（1xxx）。修复前 4 处命中，现 0 |
| ② 完整类型检查（报告制） | `npm run typecheck:report` | 否 | 否（报告） | 后端为 JS，按 05 ADR-02「逐模块迁移 TS」，当前 475 条诊断/5 类，**不作为门禁** |
| ② 完整类型检查（门禁） | 前端 `npm run build` = `tsc -b && vite build` | 否 | **是** | 前端 TS 全量类型检查 + 构建 |
| ③ 路由替身测试 | `npm test`（= `test:unit` + `test:contract`） | **否**（注入桩 db/actor） | **是** | 无端口、无 DB、无 JWT；覆盖装配契约与路由行为 |
| ④ 真实集成测试 | `npm run test:integration` | **是**（专用隔离库） | **是** | 缺库 → ENV_BLOCKED（退出码 2）且**不算 PASS** |
| 库生命周期 | `test:db:reset` / `test:db:check` / `test:db:drop` | 管理通道 | — | 重建/校验/销毁隔离库 |

**隔离测试库（本机）**：`rdpms_test`（owner `rdpms_migrate`），配置在 `<repo>/.env.test.local`（gitignore 命中，权限 600）。
守卫（`scripts/lib/testDbGuard.mjs`）强制：本机 host + 库名匹配 `^rdpms_test(_[a-z0-9_]+)?$`，**显式拒绝** `rdpms`（生产）、`rdpms_drill`、`postgres`、`template*`；`DATABASE_URL` 与 `DIRECT_URL` 必须指向同一测试库。
`npm run test:db:reset` = 销毁 → 创建 → `migrate deploy` → 授权运行角色 → 运行 `prisma/seed.js`（最小测试数据）→ 以运行角色真实读表校验。

---

## 2. RF01 可测试启动与 JS 错误检查

**状态：DONE**

### 2.1 对应发现

| F | 等级 | 内容 | 处理 |
|---|---|---|---|
| F02 | P1 | `routes/reports.js` 调用未导入的 `assertProjectCapability` → 创建/审核/驳回 500 | 补齐导入 + 回归用例锁死 |
| F18 | P2 | 启动、数据库与路由耦合（`routes` 反向 `import prisma from '../index.js'`） | 拆 `createApp` / `server` / 实例级依赖注入 |
| F21 | P2 | 测试能力不足（仅 `rbac.test.mjs`，无 CI） | 四层测试 + 未定义标识符门禁 + CI 合并门禁 |

计划外同族新发现（已修）：`src/kernel/sequence.js:12` JSDoc 引用未导入的 `PrismaClient`（TS2304）。

### 2.2 变更文件

新增：

| 文件 | 作用 |
|---|---|
| `src/bootstrap/createApp.js` | 应用装配 `createApp({db, clock, idGenerator, actorResolver, services})`，不监听、不连库 |
| `src/bootstrap/server.js` | 唯一启动入口：生产密钥守卫 + 构造客户端 + `serve()` |
| `src/platform/requestContext.js` | 请求作用域的实例级依赖（AsyncLocalStorage）：`runWithContext` / `currentDb` / `currentActorResolver` |
| `src/platform/db/client.js` | 按作用域解析的 `prisma` 代理 + `createPrismaClient`（惰性 fallback，仅脱离作用域时使用） |
| `src/platform/identity/actorResolver.js` | 身份解析（从实例作用域读取；未注入则走默认 JWT） |
| `scripts/check-undefined.mjs` | 未定义标识符/语法门禁 + `--full` 完整类型报告模式 |
| `scripts/lib/testDbGuard.mjs` | 隔离测试库守卫（校验与执行共用同一判定） |
| `scripts/test-db.mjs` | 测试库生命周期：check / reset / migrate / drop |
| `scripts/run-integration.mjs` | 集成测试运行器：先守卫，再以测试库环境运行 `node --test` |
| `tests/unit/*.mjs`（3） | 路由替身测试（含实例隔离交错用例） |
| `tests/contract/*.mjs`（1） | 装配契约测试 |
| `tests/integration/*.mjs`（1） | 真实集成测试（连接 `rdpms_test`） |
| `tests/helpers/stubDeps.mjs` | 桩依赖（桩 db/actor + 请求门闩，用于构造真交错） |
| `.github/workflows/ci.yml` | CI：后端门禁 / 隔离 PostgreSQL 集成 / 前端构建 三个 job |

修改：`src/index.js`（150→11 行，仅转发）、`src/kernel/rbac.js`（身份可注入）、
`src/routes/reports.js`（补导入）、`src/kernel/sequence.js`（JSDoc 类型）、
`src/{routes,kernel}/*.js`（29 个文件的 prisma 引用改指注入点）、`package.json`（脚本映射）。

### 2.3 数据库迁移

**无**（RF01 不涉及 schema 变更）。测试库由迁移 + 种子重建，不影响生产/演练库。

### 2.4 新旧契约映射

| 项 | 旧 | 新 |
|---|---|---|
| 服务入口 | `src/index.js` 同时装配 + 启动 | `index.js` → `bootstrap/server.js` → `createApp()` |
| 数据库依赖 | 路由反向导入进程级单例 | **实例级**：`createApp({db})` 只作用于本实例请求作用域 |
| 身份解析 | 进程级固定 JWT 流程 | 实例可注入 `actorResolver`（默认 JWT 不变） |
| 端口监听 | 导入 `index.js` 即监听 | 只有 `server.js` 允许 `serve()` |
| 幂等中间件 | 鉴权前命中缓存（F01，RF02 处理） | **本批未动**，仍在 `createApp` 中全局注册 |
| 对外 HTTP 行为 | — | 不变（入口、端口、日志、响应格式均不变） |

### 2.5 测试名与实际输出

`cd rdpms-system/backend && npm test`（不连数据库）：

```
ok 1..6  RF01-01 导入 createApp 不连接数据库、不监听端口
         RF01-02 入口拆分后 index.js 仍是可启动的服务入口（仅此文件允许 serve）
         RF01-03 POST /api/reports 创建日报不返回 ReferenceError
         RF01-04 POST /api/reports/:id/approve 审阅不返回 ReferenceError
         RF01-05 POST /api/reports/:id/reject 驳回不返回 ReferenceError
         RF01-06 注入的 db 与 actor 确实生效（依赖注入而非全局单例）
ok 7/8   RF01-09 两个应用实例交错请求时数据库完全隔离（实例级注入）
         RF01-10 交错请求中的鉴权上下文同样不串用（身份来自各自实例）
ok 9/10  RF01-07 当前后端源码不存在未定义标识符
         RF01-08 故意遗漏 import 时检查必须失败
# tests 10 # pass 10 # fail 0
ok 1..6  RF01-C1…C5（装配契约：依赖形参 / 健康检查 / 401 契约 / 404 契约 / 无 DATABASE_URL 可装配）
# tests 6 # pass 6 # fail 0
```

修复前同一组为 **0 通过 / 5 失败**。

`npm run lint:undefined`：

```
[check-undefined] no undefined identifiers in 50 file(s) under src, prisma, scripts
```

`npm run typecheck:report`（报告制，非门禁）：`50 个文件，475 条诊断，5 种错误码`。

`npm run test:db:reset`（隔离库重建）：

```
[test-db] DATABASE_URL → rdpms_app@127.0.0.1:5432/rdpms_test
[test-db] DIRECT_URL   → rdpms_migrate@127.0.0.1:5432/rdpms_test
permissions(P0) 90 / RolePermission 合计 289 / 六角色 90-80-66-31-19-3
[test-db] 重建完成：rdpms_app@rdpms_test 可读 47 张表
```

`npm run test:integration`（真实库，含原 RBAC 测试）：

```
ok 1  RF01-I1 真实数据库下装配的应用可响应就绪检查
ok 2  RF01-I2 连接角色是测试库角色（确认未连到生产/演练库）
ok 3  RF01-I3 默认 JWT 流程与注入身份流程在真实装配下都可达
ok 4  T1a 各角色权限数量符合 M-1（90/80/66/31/19/3）
ok 5  T1b RolePermission 总数 = 289
ok 6  T1c permissions 表 = 98
ok 7  T2 ADMIN 不持有 10 项排除权限
ok 8  T3 AUDITOR 恰好持有 audit.view / audit.export / system.logs.view
# SKIP T4 / T5（需本地起服 + SMOKE_SA_PASSWORD，与改造前一致）
# tests 10 # pass 8 # fail 0 # skipped 2
```

部署形态冒烟（演练库 `rdpms_drill`，`NODE_ENV=staging`，端口 3211，未触碰生产）：
`health=200 ready=200 未授权=401`，启动日志不变。

### 2.6 未运行项

| 项 | 状态 | 原因 |
|---|---|---|
| `test:e2e` | NOT_RUN | 尚无被测对象（RF13/RF15 交付） |
| `test:restore` | NOT_RUN | RF16 范围 |
| 前端构建 | NOT_RUN（本批未改前端） | — |
| CI 实际执行 | NOT_RUN | 工作流未推送（本轮约定不 push） |
| T4/T5 HTTP 断言 | SKIP | 需本地服务与 SMOKE_SA_PASSWORD；与改造前一致 |

### 2.7 数据风险

- 未连接生产库；测试写入仅发生在 `rdpms_test`；演练库冒烟只做只读请求（health/ready/401）。
- `rdpms_test` 可随时 `npm run test:db:drop` 销毁；`rdpms_drill` 未被本批触碰。
- 依赖注入的实例隔离依赖请求作用域：脱离请求上下文的代码（worker/脚本）会回落到 fallback 客户端，
  必须在后续批次显式接收依赖（已写入代码注释与本节）。

### 2.8 回退方法

- 代码：丢弃分支 `refactor/rdpms-guidance-v2` 上的提交（或 `git revert`）。
- 数据库：`npm run test:db:drop` 删除测试库；生产/演练库无任何变更。
- 运行：未部署、未重启任何服务。

### 2.9 ADR 偏离

无偏离。05 §1 要求 `createApp(deps)` 不监听、`server` 才 serve，本批照此实现；
旧 JS 路由按 05「逐模块迁移」保留，仅改变依赖来源；命令层与 `modules/*` 目录属 RF04/RF06/RF11 范围。

---

## 3. RF02 幂等访问边界

**状态：DONE**

### 3.1 对应发现

| F | 等级 | 内容 | 处理 |
|---|---|---|---|
| F01 | P0 | 幂等缓存在鉴权之前命中，且只按 Idempotency-Key 为键 | 删除鉴权前中间件；回执改为「鉴权 → 资源授权 → 状态校验 → 查回执」 |
| F09 | P0 | 回执不绑定用户/内容，业务写入与回执创建无共同事务 | 持久化作用域回执（actor+command+resourceScope+key+payloadHash），与业务、严格审计同事务 |
| F15（部分） | P1 | 审计吞错、与业务不同事务 | 新增 `writeAuditStrict`：事务内写入，失败回滚业务（本批先用于被接线的两个命令） |

### 3.2 变更文件

| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | 新增 `MutationReceiptStatus` 枚举、`MutationReceipt` 模型、User 反向关系 |
| `prisma/migrations/20260915120000_mutation_receipts/migration.sql` | Additive 迁移（枚举 + 表 + 3 索引/唯一键 + 外键） |
| `src/platform/idempotency/receipts.js` | `withIdempotency`：授权后查回执、payloadHash 校验、事务内占位 → 业务 → 回填 |
| `src/platform/idempotency/payloadHash.js` | 规范化 JSON + sha256 |
| `src/platform/audit/strictAudit.js` | 事务内严格审计（失败回滚） |
| `src/kernel/audit.js` | 抽出 `buildAuditRow`，两种写入共用字段口径 |
| `src/bootstrap/createApp.js` | **删除**鉴权前的 `createIdempotencyMiddleware` 全局注册 |
| `src/middleware/idempotency.js` | **删除**（F01 根因：鉴权前内存缓存） |
| `src/routes/reports.js` | `PUT /:id` 与 `POST /:id/submit` 接入 `withIdempotency`；两处均改为「授权 → 回执」顺序并写严格审计 |
| `tests/unit/rf02-idempotency.test.mjs` | 12 条路由替身用例 |
| `tests/integration/rf02-idempotency.integration.test.mjs` | 6 条真实库用例（并发/重启/撤权/失败/哈希冲突/同事务） |
| `tests/integration/fixtures.mjs` | 集成测试最小夹具（固定 ID 合成数据） |
| `tests/helpers/stubDeps.mjs` | 桩新增 mutationReceipt 与「失败还原」的事务语义 |

### 3.3 数据库迁移

迁移 `20260915120000_mutation_receipts`（**Additive，可回退**）：
新增枚举 `MutationReceiptStatus`、表 `mutation_receipts`（含 `actor_id`/`command`/`resource_scope`/`idempotency_key`/`payload_hash`/`response_status`/`response_body`/`expires_at`），
唯一键 `mutation_receipts_scope_key(actor_id, command, resource_scope, idempotency_key)`，索引 `expires_at`、`(actor_id, created_at)`，外键指向 `users(id)`。
`prisma migrate diff --from-url <测试库> --to-schema-datamodel` 对 `mutation_receipts` **无漂移**（另有 `audit_logs`/`doc_documents` 的既有漂移，非本次引入）。
未对生产库与 `rdpms_drill` 执行任何迁移。

### 3.4 新旧契约映射

| 项 | 旧 | 新 |
|---|---|---|
| 幂等命中时机 | 鉴权前（中间件，任意 PUT） | 鉴权 + 资源授权 + 状态校验**之后** |
| 回执键 | 仅 `Idempotency-Key` | `actor + command + resourceScope + key`（另存 payloadHash） |
| 存储 | 进程内存 Map（重启即失效） | PostgreSQL 表（重启后仍可回放） |
| 内容校验 | 无 | 同键不同内容 → 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` |
| 原子性 | 先写业务、后写回执（无事务） | 业务 + 严格审计 + 回执同事务；失败整体回滚 |
| 并发同键 | 无保证 | 唯一索引阻塞后到事务 → 读取已提交回执并回放（无则 409 `IDEMPOTENCY_IN_PROGRESS`） |
| 键来源 | `Idempotency-Key` 头 | 优先请求体 `clientMutationId`，其次 `Idempotency-Key` 头（旧客户端仍可用） |
| 前端影响 | — | 前端从未发送 `Idempotency-Key`，无行为变化 |

### 3.5 测试名与实际输出

路由替身（`npm test`，不连库）——RF02 部分：

```
ok RF02-U1  相同幂等键、不同用户：不得回放他人响应
ok RF02-U2  相同幂等键、不同资源：不得跨资源回放
ok RF02-U3  相同幂等键、不同请求内容 → 409 且不回放
ok RF02-U4  相同幂等键、相同内容：返回存储响应且业务只执行一次
ok RF02-U5  业务校验失败：不留下回执与半成品
ok RF02-U6  未授权（非项目成员）：先授权后回执，不产生回执
ok RF02-U7  撤权后不得回放：同一 key 重试返回拒绝而不是旧成功响应
ok RF02-U8  审计写入失败：业务回滚，不留回执（关键证据与业务同生共死）
ok RF02-U9  提交命令（POST /submit）同样走回执：重放不重复生成版本
ok RF02-U10 无幂等键时仍执行（兼容旧客户端），但不写回执
ok RF02-U11 未认证请求持相同 key：返回 401，不回放已缓存的成功响应（F01 回归）
ok RF02-U12 相同 key、不同命令：不得跨命令回放
# tests 22 # pass 22 # fail 0   （全量：22 单元 + 6 契约）
```

真实集成（`npm run test:integration`，隔离库 `rdpms_test`）：

```
ok RF02-I1 并发相同幂等键：只生效一次，其余回放同一响应（5 并发 → 1 版本 / 1 回执 / 1 审计 / 4 次回放）
ok RF02-I2 进程重启后回执仍在：新客户端重放不重复执行
ok RF02-I3 撤权后不得回放：同一 key 重试被拒绝（404，无回放头）
ok RF02-I4 事务失败（状态不允许）：不留回执、不改数据
ok RF02-I5 相同幂等键、不同请求内容 → 409 且不改数据
ok RF02-I6 业务与审计同事务：提交后审计与版本都在同一提交中
# tests 16 # pass 14 # fail 0 # skipped 2（T4/T5 需本地起服，与改造前一致）
```

部署形态冒烟（演练库，端口 3211）：`health=200 ready=200 reports_unauth=401`，
并且 **`PUT` 带 `Idempotency-Key` 但未认证 → 401**（旧实现会回放历史 200，F01 已关闭）。

### 3.6 未运行项

| 项 | 状态 | 说明 |
|---|---|---|
| 仅两个命令接入回执 | 部分 | `PUT /api/reports/:id`、`POST /api/reports/:id/submit`；其余写入口在 RF04 统一收敛 |
| 回执过期清理任务 | NOT_RUN | `expires_at` 仅落库，清理作业未实现（不影响正确性） |
| 同步路径回执（sync push） | NOT_RUN | 属 RF07/RF09 |
| `audit_logs` append-only 的清理 | 不适用 | 集成测试改用增量断言（DB 触发器禁止删除审计） |

### 3.7 数据风险

- 迁移为 Additive，未触碰既有列；生产库与 `rdpms_drill` 未执行任何迁移或写入。
- `rdpms_test` 为一次性隔离库，可 `npm run test:db:drop` 销毁。
- 行为变化：`PUT /api/reports/:id` 现在要求项目成员与 `write` 能力（原先只校验作者），
  即「被移出项目者不能再改自己的汇报」——与 05 §2 一致，属预期收紧；RF04 会统一其余入口。

### 3.8 回退方法

- 代码：`git revert <RF02 提交>`（或丢弃分支）。删除的中间件会随 revert 恢复。
- 数据库：`DROP TABLE "mutation_receipts"; DROP TYPE "MutationReceiptStatus";`（无其他对象依赖）。
- 运行：未部署、未重启任何生产服务。

### 3.9 ADR 偏离

无。05 §2 的「持久化 MutationReceipt、先授权后回放、同 key 不同 payload 409、失败不留回执」逐条实现；
06 要求的「不得仅把内存 Map 换成数据库表」已通过「唯一索引 + 同事务 + 严格审计」满足。

---

## 4. RF03 日报日期/DTO/提交

**状态：DONE**

### 4.1 对应发现

| F | 等级 | 内容 | 处理 |
|---|---|---|---|
| F03 | P0 | 前端把 period 一律 `slice(0,7)`，DAILY 也提交月份键 → 09-14 与 09-15 落到同一唯一键互相覆盖 | 前后端统一周期键规则；服务端按类型严格校验（含真实日期） |
| F04 | P1 | 后端 content 是 JSONB 对象，前端按字符串 `JSON.parse` → 抛错后清空项目汇报数组（回填丢项/评审页空白） | 新增边界适配器（对象/字符串都支持），解析失败显式提示且禁止回写空表 |
| F05 | P0 | POST 可直接写入 `status`；编辑页「提交」发 status 但 PUT 白名单不含 status → 既不生效也不报错 | 保存接口禁止携带状态；提交改走专用命令（写版本+状态+审计） |
| F04 同族 | — | 列表/评审页读旧字段 `month`/`userId`/`approvedAt`/`approveNote`（后端已迁移为 `periodKey`/`authorId`/`reviewedAt`/`reviewNote`） | 全量对齐到规范 DTO |

### 4.2 变更文件

后端：

| 文件 | 改动 |
|---|---|
| `src/modules/reports/reportRules.js`（新） | 周期键规则真源：`normalizeReportType` / `validatePeriodKey` / `PERIOD_KEY_FORMAT` / `isReportPeriodConflict`；纯规则，无 HTTP/Prisma 依赖 |
| `src/routes/reports.js` | POST 改为「只保存草稿」：去掉 status 白名单、按类型校验周期键、已提交/已审阅 409 锁定、软删墓碑显式重建；PUT 增加周期键校验与类型一致性校验，唯一键冲突映射 409 `DUPLICATE_PERIOD_KEY` |
| `tests/unit/rf03-report-period.test.mjs`（新） | 10 条路由替身用例 |
| `tests/integration/rf03-report-period.integration.test.mjs`（新） | 4 条真实库用例 |
| `tests/helpers/stubDeps.mjs` | 桩支持复合唯一键 `findUnique` |

前端：

| 文件 | 改动 |
|---|---|
| `src/shared/reportPeriod.ts`（新） | `periodKeyFor` / `isoWeekKey` / `reportTypeEnum` / `REPORT_TYPE_CN_TO_ENUM`；缺少输入返回 null，不猜造 |
| `src/shared/reportContent.ts`（新） | `readReportContent`（对象/字符串/空值）与 `normalizeReportContent`；失败返回原因 |
| `src/api/adapters/report.ts`（新） | `toReport` / `toReportList`：原始响应 → 领域模型（补 `authorId`/`periodKey`、`contentReadError`） |
| `src/types/report.ts` | 领域模型与 DTO 重写（`RawReport` 只给适配器用；`content` 为对象） |
| `src/api/endpoints/reports.ts` | list/get/save/update 经过适配器；`submit` 支持 `clientMutationId` |
| `src/pages/ReportEdit.tsx` | 内容直接取对象（不再 JSON.parse）；周期键按类型计算；保存/提交拆分；多项目逐条保存并逐条报告失败；离线分支改为写对象而非字符串 |
| `src/pages/Reports.tsx` / `ReportReview.tsx` | 统一用 `periodKey`/`authorId`/`reviewNote`/`reviewedAt`，内容走适配器 |
| `scripts/run-unit-tests.mjs`（新） | 前端纯逻辑测试运行器（复用已有 esbuild，无新增依赖） |
| `tests/unit/*.test.ts`（新） | 14 条前端用例（周期键 + 内容归一化） |

### 4.3 数据库迁移

**无**（RF03 不涉及 schema 变更；唯一键 `projectId+authorId+reportType+periodKey` 已存在，本批只是不再向它写入错误的键）。

### 4.4 新旧契约映射

| 项 | 旧 | 新 |
|---|---|---|
| DAILY 周期键 | 前端 `2026-09`（月份） | `2026-09-15`（服务端强校验，月键直接 400） |
| WEEKLY 周期键 | 无格式约束 | `YYYY-Www`（周序 01-53） |
| MONTHLY 周期键 | `YYYY-MM` | `YYYY-MM`（月份 01-12） |
| 日期真实性 | 未校验 | `2026-02-30` 一律 400 |
| content | 字符串 JSON（前端 parse） | JSONB 对象；字符串仅在边界适配器兼容 |
| status | POST 可写入任意状态 | 保存接口禁止（客户端 REVIEWED → 400）；提交走专用命令 |
| 已提交内容 | 保存接口可覆盖 | 所有保存入口 409 锁定 |
| 汇报人/审阅字段 | 前端读 `userId`/`approvedAt`/`approveNote` | `authorId`/`reviewedAt`/`reviewNote` |
| 「提交」按钮 | 只发 status（服务端忽略 → 什么都不发生） | 先保存再调用提交命令，写版本+状态+审计（幂等） |

### 4.5 测试名与实际输出

后端路由替身（`npm test`）：

```
ok RF03-U1  DAILY 拒绝月份键（09-14 与 09-15 不能落到同一键）
ok RF03-U2  同人同项目两天 DAILY 产生两条
ok RF03-U3  同一天重复保存仍然只更新同一条
ok RF03-U4  WEEKLY / MONTHLY 键格式校验
ok RF03-U5  不存在的日期（2026-02-30）被拒绝
ok RF03-U6  客户端 REVIEWED 被拒绝
ok RF03-U7  已提交/已审阅的汇报不能被保存接口覆盖
ok RF03-U8  PUT 同样按类型校验 periodKey
ok RF03-U9  PUT 改类型时必须与键格式一致
ok RF03-U10 提交确实写版本与状态（并留严格审计）
# tests 32 # pass 32 # fail 0（单元，含 RF01/RF02/RF03）
# tests 6  # pass 6  # fail 0（契约）
```

真实集成（`npm run test:integration`，隔离库 `rdpms_test`）：

```
ok RF03-I1 同人同项目两天 DAILY 产生两条（真实唯一约束）
ok RF03-I2 同一天重复保存仍然是同一条（upsert 语义）
ok RF03-I3 月份键被服务端拒绝
ok RF03-I4 已提交的汇报不能被保存接口覆盖（真实状态约束）
# tests 20 # pass 18 # fail 0 # skipped 2
```

前端（`npm test`，esbuild + node:test）：

```
ok RF03-F1/F2/F3/F4/F5/F6/F7  周期键：DAILY 完整日期、同月两天不同键、ISO 周（含跨年）、MONTHLY、缺输入返回 null、中文→枚举
ok RF03-F8..F13b              内容：对象直用、字符串兼容、解析失败暴露错误、空值、非对象、多项目往返无丢项
# tests 14 # pass 14 # fail 0
```

前端类型检查与构建：`npm run build`（`tsc -b && vite build`）通过（主包 805.51 kB，F19/RF15 范围内）。
部署形态冒烟（演练库只读，端口 3211）：`health=200 ready=200 reports_unauth=401 post_unauth=401`。

### 4.6 未运行项

| 项 | 状态 | 说明 |
|---|---|---|
| 浏览器端全流程（编辑→保存→提交→审阅） | NOT_RUN | `test:e2e` 属 RF13/RF15 范围；本批用前端纯逻辑用例 + 类型检查 + 后端集成覆盖 |
| 旧错误月份键历史数据处置 | 未做 | 按 F03 要求「进入迁移待核实，不自动虚构日期」，本批只阻止新增，未改历史行 |
| 逐项目 UI 状态面板与重试按钮 | 部分 | 已改为逐条保存 + 失败清单提示；完整 UI 属 RF15 |
| 新建汇报的幂等回执 | 未接线 | POST 暂未接 `withIdempotency`（RF04 统一命令入口时接入） |

### 4.7 数据风险

- 无 schema 变更；未连接生产库；演练库仅只读冒烟。
- **行为收紧（预期）**：DAILY 提交月份键现在返回 400。旧缓存前端若仍按月份保存日报会看到明确报错，
  而不会再静默把同月多天合并到一行。
- 软删除的同周期汇报再次保存会显式重建（`deletedAt: null`），避免写入不可见的墓碑行。

### 4.8 回退方法

- 代码：`git revert <RF03 提交>`。
- 数据库：无需动作。
- 运行：未部署、未重启任何生产服务。

### 4.9 ADR 偏离

| 项 | 结论 |
|---|---|
| 前端新增测试栈 | 未引入新依赖：复用 Vite 已安装的 esbuild 打包 TS 用例后跑 `node:test`（06 要求 `test:unit` 存在，仓库前端原本无测试栈） |
| 后端新模块仍为 JS | 05 ADR-02 目标为「新模块全 TS」，但后端当前没有 TS 构建链（`ExecStart=node src/index.js`）。引入 TS 构建会改变部署形态，属重大技术方案变更，**先请示再动**；本批模块用 JSDoc 类型 + 静态门禁约束 |

---

## 5. RF04 所有写入口授权

**状态：DONE**

### 5.1 对应发现

| F | 等级 | 内容 | 处理 |
|---|---|---|---|
| F06 | P0 | 汇报 PUT 只校验作者不校验项目成员；DELETE 只校验「草稿 + 全局删除权限」；recall 无项目访问复核 | 三处统一「项目访问 → 能力 → 作者 → 状态」顺序，且与同步入口共用同一守卫 |
| F07 | P0 | sync 只校验项目 write，不看实体动作权限，也不锁定已审阅汇报 | 新增 `loadSyncAccess` + `assertSyncEntityActions`：同步与普通 API 调用同一组守卫；汇报补丁走同一构造/校验函数 |
| F13 | P1 | 通用 PUT 可改 `status`/`assigneeId`，绕开专用动作权限 | 任务 PUT 按字段判定：状态变更要 `tasks.change_status` + transition；指派要 `tasks.assign` + assign |

### 5.2 变更文件

| 文件 | 改动 |
|---|---|
| `src/modules/access/writeGuards.js`（新） | 动作级授权真源：`assertActionPermission` / `assertTaskEdit` / `assertTaskStatusChange` / `assertTaskAssign` / `assertPhaseStatusChange` / `assertPhaseBelongsToProject` / `assertReportWritable` / `REPORT_EDITABLE_STATUSES` |
| `src/modules/reports/reportCommands.js`（新） | `parseContentInput` + `buildReportDraftPatch`：周期键按类型校验与内容归一化的**单一实现**，HTTP 与 sync 共用 |
| `src/routes/reports.js` | PUT 改用共享守卫与补丁构造；DELETE 增加项目访问 + 作者 + 状态（409 `INVALID_STATE`）；recall 增加项目访问 + 能力 |
| `src/routes/tasks.js` | PUT 增加字段级动作权限判定（状态变更 / 指派各自校验） |
| `src/routes/sync.js` | 新增 `loadSyncAccess`（与 `resolveProjectAccess` 同源口径）；新增 `assertSyncEntityActions`；实体注册表补 `permission`/`createPermission`/`statusPermission`/`assignPermission` 与 `lockRule`；删除已无调用方的 `assertProjectWrite` |
| `tests/unit/rf04-write-authorization.test.mjs`（新） | 14 条路由替身用例 |
| `tests/integration/rf04-write-authorization.integration.test.mjs`（新） | 5 条真实库用例 |
| `tests/integration/fixtures.mjs` | 增加第二项目 / 两个阶段 / 一个任务 |
| `tests/helpers/stubDeps.mjs` | 桩新增 task / projectPhase / syncDevice / syncMutation 与快照字段 |
| `tests/unit/rf02-idempotency.test.mjs` | 锁定状态错误码由 400 对齐为 **409 `INVALID_STATE`**（方案 §G：状态错误 409） |

### 5.3 数据库迁移

**无**。

### 5.4 新旧契约映射

| 项 | 旧 | 新 |
|---|---|---|
| 汇报删除 | 校验草稿 + 全局 `reports.delete`，无作者/项目判定 | 项目访问（非成员 404）→ `write` 能力 → 作者 → 草稿状态 |
| 汇报撤回 | 无项目访问复核 | 同上顺序（状态要求 SUBMITTED） |
| 汇报锁定错误码 | `400 VALIDATION_ERROR` | `409 INVALID_STATE`（与提交/删除/撤回统一，方案 §G） |
| 任务 PUT 改状态 | 只要 `tasks.update` + `write` | 需 `tasks.change_status` + 项目 `transition` |
| 任务 PUT 改负责人 | 只要 `tasks.update` + `write` | 需 `tasks.assign` + 项目 `assign` |
| sync 上行 | 只看项目 write；已审阅汇报可改 | 与普通 API 同源：项目访问 + 实体动作权限 + 汇报锁定 + 周期键校验 |
| sync 跨项目引用 | 不校验 task/milestone 的 `phaseId` | 复用 `assertPhaseBelongsToProject`，与 HTTP 同一实现 |

### 5.5 测试名与实际输出

路由替身（`npm test`）：

```
ok RF04-U1  被移出项目的作者不能删除自己的汇报
ok RF04-U2  非作者即使有 reports.delete 也不能删除他人汇报
ok RF04-U3  被移出项目的作者不能撤回自己已提交的汇报
ok RF04-U4  成员但无 write 能力（VIEWER）不能更新自己的汇报
ok RF04-U5  只有 tasks.update 时不能通过通用 PUT 改状态
ok RF04-U6  有 tasks.change_status 但项目能力无 transition 时仍不能改状态
ok RF04-U7  有 tasks.update 时不能通过通用 PUT 改负责人
ok RF04-U8  同时具备权限与项目能力时，状态流转正常放行（回归）
ok RF04-U9  跨项目 phaseId 被拒绝（任务更新）
ok RF04-U10 同步不得覆盖已审阅汇报的内容（reviewed 锁定）
ok RF04-U11 同步不得修改他人汇报
ok RF04-U12 同步改任务状态需要 tasks.change_status（无权限则拒绝）
ok RF04-U13 同步里的跨项目 phaseId 被拒绝
ok RF04-U14 被移出项目后同步更新被拒绝
# tests 46 # pass 46 # fail 0（单元，含 RF01–RF04）
# tests 6  # pass 6  # fail 0（契约）
```

真实集成（`npm run test:integration`）：

```
ok RF04-I1 被移出项目后，作者不能更新/撤销/删除自己的汇报
ok RF04-I2 同步不得覆盖已审阅汇报（真实状态锁定）
ok RF04-I3 同步改任务状态需要 tasks.change_status（真实权限与项目能力）
ok RF04-I4 跨项目 phaseId 在普通 API 与同步入口都被拒绝
ok RF04-I5 同项目内的 phaseId 正常放行（回归）
# tests 25 # pass 23 # fail 0 # skipped 2
```

门禁与构建：`lint:undefined` 55 文件 0 命中；`typecheck:report` 485 条诊断/6 类（非门禁）；前端 `npm test` 14/14、`tsc -b` 通过。
部署形态冒烟（演练库只读）：`health=200 ready=200 reports_unauth=401 sync_unauth=401`。

### 5.6 未运行项

| 项 | 状态 | 说明 |
|---|---|---|
| milestone / monthlyProgress / projects 的同步动作权限 | 部分 | 本批只覆盖验收涉及的 reports / tasks / projectPhases；其余实体仍为「项目能力」判定，待后续批次按同一守卫补齐 |
| 导入入口 | 已核查 | 仓库内唯一导入入口 `POST /api/regulatory-documents/import` 已校验 `regulatory_documents.update` 动作权限；实验导入（ImportSession）属 RF13/RF14 |
| 任务创建携带初始状态 | 未改 | 创建时的初始状态仍随 `tasks.create` 一起判定，未要求 `change_status`（F13 只针对「更新」绕过） |
| 演练环境 sync E2E（21 项） | NOT_RUN | 按本轮约定不对 `rdpms_drill` 执行测试写入；需在专用演练库复核 |
| 前端权限门控 | 未改 | 已按服务端为准；前端按钮级门控属 RF15 |

### 5.7 数据风险

- 无 schema 变更；未连接生产库；演练库仅只读冒烟。
- **行为收紧（预期）**：离线同步现在会按实体动作权限拒绝——仅有项目 write、缺少 `tasks.update`/`reports.update` 等权限的角色，其离线改动不再落库（客户端会显示 rejected 并保留草稿）。
- `assertReportWritable` 的锁定错误码由 400 改为 409，前端提示文案随之变化（不影响成功路径）。

### 5.8 回退方法

- 代码：`git revert <RF04 提交>`。
- 数据库：无需动作。
- 运行：未部署、未重启任何生产服务。

### 5.9 ADR 偏离

无偏离。05 §2「同步是业务命令的传输适配器」在本批以「共用守卫 + 共用补丁构造」落地；
`sync` 仍保留通用写入通道（未逐实体改写为独立命令函数），已在上表「未运行项」标注为后续批次收敛项。

---

## 6. 下一批：RF05 文件作用域

计划（06）：`FileAccessPolicy`、历史归属分类、staging 机制。
验收：甲项目成员看不到乙文件列表/metadata/下载；上传者私有暂存隔离；import-source 也检查；
历史无归属文件不自动公开。
