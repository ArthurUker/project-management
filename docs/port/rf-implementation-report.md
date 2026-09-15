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

## 3. 下一批：RF02 幂等访问边界（实施中）

内容：撤销「鉴权前缓存命中」；持久作用域回执 + payloadHash；回执与业务数据、关键审计同事务提交。
验收：相同 key 不同用户/路径不能回放他人内容；撤权后不能回放；重启重试只写一次；不同 payload 409；
并发同 key 只生效一次；事务失败不留回执与半成品。
