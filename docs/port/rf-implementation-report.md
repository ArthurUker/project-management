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

**状态：代码与服务测试通过，交互验收待完成**

> 未按「全部验收通过」记录：浏览器交互流程（不同日期新建、编辑回填、保存后提交、重新打开、
> 多项目部分失败恢复）**尚未执行**，见 §7.4。服务端与前端纯逻辑层证据见下。

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

## 6. 下一批：RF05 文件作用域（**已完成**，见 `docs/port/rf05-delivery.md`）

计划（06）：`FileAccessPolicy`、历史归属分类、staging 机制。
验收：甲项目成员看不到乙文件列表/metadata/下载；上传者私有暂存隔离；import-source 也检查；
历史无归属文件不自动公开。

**完成情况（2026-09-28）**：`src/modules/files/fileAccessPolicy.ts`（纯规则）+ `fileCommands.ts`（绑定/分类/删除守卫）
+ 迁移 `20260928120000_file_access_scope`（expand + 可逆回填）+ `scripts/backfill-file-scope.mjs`（只读盘点/幂等落库）
+ 路由全入口接入（含前端实际使用的 `GET /api/files/:id`、超管分类 `PATCH /:id/scope`、软删恢复 `POST /:id/restore`）。
证据：单元 11/11、真实隔离库 8/8、真实浏览器（真实登录会话）11/11。

---

## 7. 复核与补强（2026-09-15 第二轮，用户授权的调整项）

### 7.1 后端 TypeScript 构建链（提交 `401f6e5`，独立构建配置提交）

| 项 | 落地 |
|---|---|
| 配置 | `backend/tsconfig.json`：`strict: true` + `allowJs`（旧 JS 逐模块迁移，暂不 `checkJs`）；`outDir: dist`、`rootDir: src` |
| 迁入 TS | `modules/reports/reportRules.ts`、`modules/reports/reportCommands.ts`、`modules/access/writeGuards.ts`、`modules/tasks/taskCommands.ts`——strict 模式，**无 any / ts-ignore / 非阻断逃逸** |
| 命令 | `build`（tsc → dist）、`typecheck`（--noEmit）、`start`（dist/index.js）、`start:src`（迁移期回退）、`dev`、`test:unit/contract`（先构建再跑产物）、`test:ci`（lint + typecheck + test） |
| CI | 后端 job 增加 `typecheck` 与 `build`；移除“为检查脚本安装前端依赖”的临时步骤（后端已有 typescript） |
| 部署 | `deploy.sh` Step 7 增加后端构建 + `dist/index.js` 断言（失败即中止切流）；systemd 模板 `ExecStart=/usr/local/bin/node dist/index.js`；`preflight.sh` 增加 dist 与 tsconfig 检查；`start.sh`/`start-dev.sh`/`stop.sh` 同步 |
| 框架 | 不变（Hono + Prisma + PostgreSQL） |

**隔离环境验证（rdpms_test，端口 3212，未触碰生产与 rdpms_drill）**

| 场景 | 结果 |
|---|---|
| 构建产物启动 | `node dist/index.js` → `health=200 ready=200 reports_unauth=401` |
| 旧源码入口 | `node src/index.js` → `ERR_MODULE_NOT_FOUND: src/modules/reports/reportRules.js`（预期） |
| 回退路径 | 重新 `npm run build` 后 dist 入口恢复 `health=200`；若回退到 2026-09-15 之前（无 dist）的 release，**必须同时把 ExecStart 改回 src/index.js**（已写入 systemd 模板注释） |

**类型诊断前后对比（证明新模块未引入未受控诊断）**

| 时点 | JS 层（`typecheck:report`，非门禁） | TS 层（`typecheck`，门禁） |
|---|---|---|
| 迁入前 | 55 文件 / 485 条 / 6 类 | 无 TS 构建链 |
| 迁入后 | 52 文件 / 480 条 / 5 类 | **0 错误**（strict） |

### 7.2 RF02 幂等顺序复核（提交 `6402453`）

固定执行顺序：**鉴权 → 当前资源授权 → 回执作用域与 payloadHash 检查 → 回放**；
只有不存在回执的新命令，才在事务内执行 `validate`（状态 / revision / 引用）与 `execute`。

- `withIdempotency` 新增 `validate(tx)` 回调，返回值透传给 `execute`；状态锁定与周期键校验移入其中。
- 并发唯一键冲突：**在 catch 外层（事务已结束、连接已归还连接池）读取回执**，
  避免在已失败的 PostgreSQL 事务中继续读取（否则报 25P02）；先到者回滚时返回 409 `IDEMPOTENCY_IN_PROGRESS` + `retryable`。
- 前端 `shared/idempotency.ts`：由「操作类型 + 目标 + 内容」派生**稳定 key**，同一次逻辑操作重试复用同一 key；
  内容变更自动换 key（避免与服务端已存回执的 payloadHash 冲突）。
- 新增用例：RF02-U13/U14/U15、RF02-I7/I8、前端 key 稳定性 4 条。

**幂等键策略（明确是否必需）**

| 写接口 | 键来源 | 是否必需 | 说明 |
|---|---|---|---|
| `POST /api/reports`（新建/保存日报） | body `clientMutationId` > 头 `Idempotency-Key` | 推荐（可选） | 前端已稳定复用；无键时退化为不去重 |
| `PUT /api/reports/:id`（保存草稿） | 同上 | 推荐（可选） | 同上 |
| `POST /api/reports/:id/submit` | 同上 | 推荐（可选） | 重放不重复写版本 |
| 同步 `POST /api/sync/push` | 每条变更的 `clientMutationId` | **必需** | 缺失即整条拒绝（协议既有约束） |
| 其余写接口 | — | 尚未接入 | 属后续批次收敛范围 |

### 7.3 RF04 统一授权与命令入口（提交 `6827a57`）

- 新增 `modules/tasks/taskCommands.ts`：`updateTaskFields` / `changeTaskStatus` / `assignTask`；
  `modules/reports/reportCommands.ts` 增加 `saveReportDraft` / `submitReport`。
- **普通 API 与同步调用同一应用命令**：`routes/tasks.js` 的通用 PUT 把 `status`/`assigneeId` 摘出后分别调专用命令；
  `routes/sync.js` 的已存在记录更新同样走这些命令。
- `POST /api/reports` 接入持久幂等 + 事务内严格审计：同一次逻辑操作重试返回首次结果，不重复创建、不重复写审计。
- 动作权限逐项覆盖：edit（`tasks.update`+write）、changeStatus（`tasks.change_status`+transition）、
  assign（`tasks.assign`+assign）、submit/review/delete（各自权限 + 作者 + 项目能力 + 状态）。
- 服务端统一执行：项目归属、作者权限、审核锁定（409 `INVALID_STATE`）、跨项目引用（`phaseId`）、
  并发控制（HTTP 幂等回执 + 同步 `baseUpdatedAt`）。
- **未完成**：离线队列被拒变更的持久化草稿（F10，见 §7.5）；导入入口收敛（仓库内唯一导入入口为法规文档，
  已校验动作权限，实验导入属 RF13/RF14）。

### 7.4 验证补强（提交 `5583664`）

- 集成测试**自动启动隔离应用**（动态空闲端口 + 构建产物 + 隔离测试库），并先准备最小夹具；
  启动失败按 ENV_BLOCKED 处理，不静默跳过。
- 结果：`test:integration` **28 项全部通过、0 失败、0 跳过**（此前 T4/T5 因未起服务跳过）。
  隔离库启用 `SEED_TEST_ACCOUNTS=true`，`test:db:reset` 创建 6 个 `test_*` 账号。
- RF03 浏览器交互验收：**未执行**，因此 RF03 状态记为「代码与服务测试通过，交互验收待完成」。

### 7.5 本轮之后仍未完成（如实列出）

| 项 | 状态 | 说明 |
|---|---|---|
| RF03 浏览器流程 | NOT_RUN | 不同日期新建 / 编辑回填 / 保存后提交 / 重新打开 / 多项目部分失败恢复 |
| 离线被拒变更的持久草稿（F10） | NOT_RUN | 现仍为「从队列删除 + 内存提示」，未落 IndexedDB dead-letter |
| 导入入口 | 部分 | 实验导入（ImportSession）属 RF13/RF14；法规文档导入已校验动作权限 |
| `platform/*` 迁移 TS | 部分 | 本轮只迁入业务模块；平台层（幂等/审计/上下文）仍为 JS + JSDoc |
| milestone/monthlyProgress/projects 同步动作权限 | 部分 | 仍为项目能力判定 |
| 演练环境 sync E2E（21 项） | NOT_RUN | 按约束不对 `rdpms_drill` 做测试写入 |
| RF05 文件作用域 | **DONE（2026-09-28）** | `docs/port/rf05-delivery.md`：策略+迁移+staging+历史分类；单元 11/11、集成 8/8、浏览器 11/11 |

---

## 8. 第三轮补强（2026-09-15，用户调整顺序）

### 8.1 RF04 补齐（提交 `22b100b`）

- **同步注册表全实体动作权限**：`projects.update`、`project_phases.update/create`、`milestones.update/create`、
  `progress.update/create`（monthlyProgress）、`projects.manage_members`（projectMembers）；
  `assertSyncEntityActions` 改为通用判定（删除/更新用 `permission`，新建用 `createPermission`）。
- **任务 PUT 原子性**：编辑/状态/指派三个命令在**同一事务**内执行——混合字段要么全成功、要么全不变
  （用例 RF04-U16：缺 `tasks.assign` 时标题/状态/指派全部保持原值）。
- **入口矩阵**：

| 实体 | 普通 API | sync（编辑） | sync（新建） | 删除 | 状态转换 | 指派 |
|---|---|---|---|---|---|---|
| reports | `reports.update`+write | `reports.update`+write+锁定 | `reports.create` | `reports.delete`+write | `reports.submit`/`review` | — |
| tasks | `tasks.update`+write | 同左 | `tasks.create`+write | `tasks.delete`+write | `tasks.change_status`+transition | `tasks.assign`+assign |
| projects | `projects.update` | `projects.update` | 不支持离线新建 | `projects.delete` | — | — |
| projectPhases | `project_phases.update` | 同左 | `project_phases.create` | `project_phases.delete` | `project_phases.change_status`+transition | — |
| milestones | `milestones.update` | 同左 | `milestones.create` | `milestones.delete` | — | — |
| monthlyProgress | `progress.update` | 同左 | `progress.create` | `progress.delete` | — | — |
| projectMembers | `projects.manage_members` | 同左（+`manage_members` 能力） | 同左 | 同左（软退出） | — | — |

### 8.2 并发控制（同提交 `22b100b`）

- 幂等回执只解决「同一次操作重试」，**不替代**并发版本校验。
- 任务/汇报命令新增 `cas`：基线写进 `UPDATE ... WHERE id = ? AND updated_at = ?`（`updateMany` + `count`），
  命中 0 行即 409 `CONFLICT`；sync 通用实体路径同样改为原子 `updateMany`。
- 同一事务内多命令时，并发基线只在**第一次写入**上校验（首次写入已改变 `updatedAt`）。
- 汇报 PUT 支持 `expectedUpdatedAt`；旧客户端缺失时走兼容路径并在审计 `metadata.noConcurrencyBaseline` 留痕。
- **实测**：RF04-I7 两路不同幂等键、相同基线并发写 → 仅一个 `applied`，另一个 `conflict`，后写者未覆盖；
  RF04-I8 过期基线 409 且数据不变、正确基线放行。

### 8.3 操作 key 生命周期（提交 `2d2caff`）

- 幂等键绑定「一次逻辑操作」而非内容哈希：重试复用；内容变化换 key；**操作成功后再次发起（内容相同）也是新 key**。
- 移除 `stableMutationId`（内容哈希语义会让第二次业务操作被静默重放）；多项目用 slot 区分；
  整体成功后才 `complete()` 关闭操作，部分失败保留键位以便重试回放。
- 前端用例 6 条（RF02-FE1..FE6）覆盖上述区别。

### 8.4 回退方案修正（提交 `c202926`）

- **`start:src` 已移除**：迁移 TS 后 `node src/index.js` 必然 `ERR_MODULE_NOT_FOUND`，不能作为回退手段。
- **回退 = release 级**：把 `/opt/rdpms/current` 指回上一个**完整 release**，并使用该 release 自带的启动配置；
  2026-09-15 之前（无 `dist`）的 release 必须把 `ExecStart` 改回 `src/index.js`，两侧必须成对。
- **数据库向后兼容**：`mutation_receipts` 为新增表，旧版本不读写，回退**不需要回滚迁移**；
  但回退到旧版本后，`mutation_receipts` 中已写入的回执会保留（无害，可用 TTL 清理）。
- **隔离验证（`/tmp/rel-sim`，rdpms_test，端口 3221）**：
  ① 新 release（`dist/index.js`）→ `health=200`；
  ② 软链切到旧 release（无 dist，`src/index.js`）→ `health=200`；
  ③ 切回新 release → `health=200`。完整切换与回退路径均已实机跑通。

### 8.5 本轮未完成（明确保留）

| 项 | 状态 | 说明 |
|---|---|---|
| 离线被拒变更的持久草稿（F10） | **未开始** | 仍为「从队列删除 + 内存提示」，未落 IndexedDB dead-letter；刷新后无法恢复 |
| 专用测试库 sync E2E | **未运行** | `deploy/scripts/drill/sync-e2e.py` 尚未对 rdpms_test 起服执行 |
| RF03 浏览器交互验收 | **未运行** | 不同日期新建/编辑回填/保存后提交/重新打开/多项目部分失败恢复 |
| RF05 文件作用域 | **DONE（2026-09-28）** | 见 §6 与 `docs/port/rf05-delivery.md`（本行保留历史状态，最新状态以 §6 为准） |

---

## 9. 第四轮（2026-09-16）：F10 持久拒绝区、隔离库 sync E2E、回退目标合规

### 9.1 离线被拒变更持久化（提交 `07a2425`）

- 新增 `offline/deadLetter.ts`：拒绝记录含**原始 payload、拒绝原因/错误码、userId/projectId 归属、
  操作身份（幂等键 + 并发基线）、首次/最近拒绝时间、attempts**；重复拒绝合并时保留最早 payload。
- `offline/idb.ts` v2 新增 `deadLetters` 存储（keyPath=key、userId 索引）；
  `deadLetterMove` 在**同一 IndexedDB 事务**内完成「写入拒绝区 → 移出待发送队列」，失败整体回滚。
- 引擎：拒绝分支改走上述原子迁移；`start(userId)` 恢复本账户拒绝区；退出登录**不清空**拒绝区
  （重新登录同一账户可恢复），读取一律按 userId 过滤。
- **验证（真实 IndexedDB，fake-indexeddb，非内存替身）**：前端 `npm test` 25/25，其中 5 条：
  同一事务迁移、刷新恢复、重复拒绝不丢内容、跨账户隔离、退出后重新登录恢复。

### 9.2 专用测试库 sync E2E（21 项全部通过）

- `deploy/scripts/drill/sync-e2e.py` 新增 `RDPMS_E2E_DB`（默认仍为演练库），本次显式指向 `rdpms_test`；
  **未对 rdpms_drill 或生产库做任何写入**。
- 修正两处演练脚本与契约不一致的载荷/判定：报表 `content` 必须是对象或 JSON 字符串；
  成员移除语义是「退出（leftAt）」。
- 结果：**21/21 PASS**（含幂等重放仅 1 条 mutation、过期基线冲突、删除墓碑、成员 leftAt、
  服务端权威字段剔除、审计与设备登记）。
- 过程中定位并排除一处环境陷阱：**3210 端口存在残留进程**，导致请求打到旧实例而误判登录 401；
  换用空闲端口后登录正常。该结论已记录，避免后续误诊。

### 9.3 删除/动作权限独立（提交 `30febe0`）

- 实体注册表新增 `deletePermission`（projects/project_phases/tasks/milestones/progress/reports 各自独立）；
  未定义删除权限的实体直接拒绝离线删除，**不再回落 update 权限**。
- 复核实证：修正前「只有 `milestones.update`」即可离线删除里程碑（applied）。
- `projectMembers` 的移除是**显式策略**：写 `leftAt` 墓碑（不是删行），沿用 `projects.manage_members`，
  不存在「用 update 授权 delete」的情况（E2E 7c 通过）。

### 9.4 无并发基线的兼容路径边界（提交 `30febe0`）

| 客户端 | 数据状态 | 是否允许无基线写入 | 说明 |
|---|---|---|---|
| 声明 `X-Client-Contract: v2` | 任意 | ❌ 400 `CONCURRENCY_BASELINE_REQUIRED` | 新版客户端缺基线必须报错，不回落兼容 |
| 未声明契约（旧客户端） | 草稿 | ✅（过渡窗口） | 审计 `noConcurrencyBaseline=true` 留痕 |
| 未声明契约（旧客户端） | 已提交/已审核 | ❌ 409 | 不得借兼容路径覆盖已定稿数据 |
| 未声明契约（旧客户端） | 实验科学数据（含 `reagentReports`） | ❌ 409 | 宁可判严；schema 若增 `dataClass` 应改读字段 |

退出条件：前端 v2 发布后兼容路径仅服务未升级客户端；窗口关闭时把 `allowLegacyCompat` 置 false 即彻底下线。

### 9.5 回退目标的合规性（要求 6）

**允许启动 ≠ 允许回退**。旧 release（`b038f21` 及更早）仍包含已确认的严重访问控制缺陷
（报告 `assertProjectCapability is not defined`、同步删除复用 update 权限、无并发基线等），
因此：

- 该 release **不得**作为回退目标：既不能作为正式回退目标，**也不得**作为「恢复在线写入」的应急选项
  （它会把已修复的访问控制缺陷重新暴露到写入口）；此类情况只能**前滚修复**（roll forward）；
- 候选回退目标必须先通过关键权限检查清单，未通过者一律不可回退；
- 回退前后必须执行关键权限检查清单：① 未授权访问 `/api/reports` 返回 401；
  ② 非成员访问项目资源返回 404；③ 同步删除需要独立 delete 权限；
  ④ 已审阅汇报拒绝覆盖；⑤ 审计表有对应记录。
- 已完成的 release 级切换验证（§8.4）只证明**切换机制可用**，不构成对旧 release 安全性的认可。

---

## 10. 第五轮：浏览器验收前置、运行清单与增量导出

### 10.1 浏览器环境（已就绪并实测）

- `playwright-core` + 缓存浏览器 `chromium_headless_shell-1234`；脚手架 `rdpms-system/frontend/tests/browser/harness.mjs`
  （独立端口启动后端与 vite dev server、等待就绪、自动生成运行清单）与 `probe.mjs`（页面结构探针）。
- vite 代理目标支持 `VITE_API_PROXY_TARGET` 覆盖，隔离测试不再依赖默认 3000 端口。

### 10.2 本轮发现并修复的阻断缺陷（既有缺陷，非本轮引入）

- **现象**：`test_super_admin` 登录后 `/reports` 全页 403，提示「当前账号未获取到任何权限点」。
- **根因**：`/api/auth/me` 的 `loadPermissions()` 对 `SUPER_ADMIN` 返回 `undefined`，调用方回落成 `[]`；
  而同步入口对同一账号返回 **98 条**权限 → 前后端口径不一致，超管界面完全不可用（后端仍放行）。
- **修复**（提交 `d5a9c5f`）：超管口径 = 全部权限码，与同步入口一致；回归用例
  `tests/unit/rf03-super-admin-permissions.test.mjs`；实测 `/api/auth/me` → `permissions=98`（含 `reports.view`）。

### 10.3 运行清单（每轮必录）

`docs/port/evidence/round5/run-manifest.json` 记录 `commit / buildId(dist mtime+size) / srcHash / backendPort /
frontendPort / database / browser`，并在启动前硬校验数据库必须含 `rdpms_test`——
用于排除「旧进程/旧构建的结果被算到新代码上」。

### 10.4 证据分类修正（IndexedDB）

F10 的 5 条用例运行在 **fake-indexeddb**（Node 进程内实现）之上，**不是真实浏览器证据**，
现已在 `evidence/round5/README.md` 与第四轮 `test-results.md` 中标注为「存储层语义验证」；
真实浏览器证据以 `tests/browser` 产出为准（本轮尚未产出 RF03 断言）。

### 10.5 科学数据保护改为「记录 + 规范化内容」

- 判定依据只来自**服务端已有记录**：`reportType` + 规范化后的 `content`；
  规范化含「JSON 字符串 → 对象」与「无法解析但有内容 → 从严视为实验数据」两种处理。
- **不依赖客户端请求头**，也**不依赖本次 payload 是否包含某字段**——否则客户端只要不带该字段即可绕过保护。
- 适用面：HTTP 汇报更新（无基线兼容路径）与同步上行（锁定/科学数据一律要求基线）。

### 10.6 回退目标合规（收紧）

- 含已确认严重访问控制缺陷的版本**不得**作为回退目标，**也不得**作为「恢复在线写入」的应急选项——只能前滚修复。
- 候选回退目标必须通过关键权限检查（未授权 401 / 非成员 404 / 删除需独立权限 / 已审阅拒绝覆盖 / 审计留痕）方可回退。

---

## 11. de260fc 独立复核（A01–A10）处理结果

完整处理表、逐项测试证据、本轮新发现的三个缺陷（登出尾段竞态 / 同步回执永久回放失败结果 / 用例日期撞库）
与交付边界声明见 `docs/port/evidence/round7/README.md`（第七轮证据包）。

本轮真实浏览器验收（全部在隔离库 rdpms_test）：`rf03` B01–B03、`rf03b` B04–B06、`f10` 离线拒绝区恢复闭环、
`a03` 账号切换隔离、`a05` 缺项目记录留存 —— 各套件结果与其 runId 清单见同目录。
