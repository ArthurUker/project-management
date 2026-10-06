# 阶段（ProjectPhase）读取与软删写入合同 — 只读核对（SUP-03 / LR5-03）

口径：本文件只做**定向只读核对**，不实施阶段过滤、恢复功能、前端、schema 或迁移改动。
所有行号对应本轮起始 HEAD `138cf2da1b63195cef7e884f69bdf8ded6ed3c21` 的工作区文件。
证据层次：静态源码核对为 `STATIC_REVIEW`；任何动态/API/UI 结论未运行的一律标 `NOT_RUN`。

## 1. 阶段读取入口表

| # | 入口 | 权限 / 项目 scope | ORM where / select | deletedAt 行为 | 源码 file:line | 客户端是否过滤或依赖该行 |
|---|---|---|---|---|---|---|
| 1 | `GET /api/projects/:id`（详情内嵌 `phases`） | `projects.view`；`resolveProjectAccess`（项目软删/非成员 → 404；SUPER_ADMIN elevated） | `include.phases: { orderBy: { sortOrder: 'asc' } }` | **未过滤 deletedAt**：详情聚合会带上软删阶段实例 | `projects.js:328`、`projects.js:341` | `ProjectDetail.tsx:51` 调用 `projectAPI.get(id)`；该页内检索 `phases` 无匹配 → 详情内嵌阶段未被该页渲染（依赖=NOT_FOUND） |
| 2 | `GET /api/projects/:id/phases` | `project_phases.view` + `assertProjectCapability('read')` | `findMany({ where: { projectId: id }, orderBy: { sortOrder:'asc' } })` | **未过滤 deletedAt** | `projects.js:814`、`projects.js:820-823` | 未在 `frontend/src` 找到直接调用者（`lookupResult=NOT_FOUND`） |
| 3 | `GET /api/phases?projectId=` | `project_phases.view` + `assertProjectCapability('read')`；`resolveProjectAccess` | `findMany({ where: { projectId }, orderBy: {sortOrder:'asc'} })` | **未过滤 deletedAt** | `phases.js:32`、`phases.js:39` | 同上，`NOT_FOUND` |
| 4 | `GET /api/phases`（无 projectId，全局列表） | `project_phases.view`（**无** capability 断言）；`projectVisibilityFilter`（成员/manager；SUPER_ADMIN 全量） | `findMany({ where: visible ? { project: visible } : {}, take: 500 })` | **未过滤 deletedAt** | `phases.js:42-50`（`phases.js:45`） | 同上，`NOT_FOUND` |
| 5 | `GET /api/phases/:id` | `project_phases.view`（**无** capability 断言）；`resolveProjectAccess(phase.projectId)` → 项目软删/非成员 404 | `findUnique({ where: { id } })` | **未过滤 deletedAt**：软删阶段详情仍返回 | `phases.js:92-99` | 同上，`NOT_FOUND` |
| 6 | 同步活跃行（upserts） | 每实体 `readPermission`；`scope=byProject`（acl.projectIds），reports 额外 `ownOnly` | `aliveFilter = { deletedAt: null }`（members 为 `leftAt: null`） | 只返回活跃行；字段经 `readFields` 投影 | `sync.js:428-436`、`sync.js:442` | 前端同步引擎（本轮未运行，`NOT_RUN`） |
| 7 | 同步墓碑（tombstones） | 同上 | `findMany({ where: { [tombstoneField]: { not: null } }, select: { id, [tombstoneField] } })` | 只返回 **id 列表**，不含业务字段 | `sync.js:452-457`、`sync.js:469` | 同上，`NOT_RUN` |

说明（区分层次，不混淆）：
- 第 1–5 行是**普通在线读取**的当前行为：在合法权限与合法项目 scope 下会返回软删阶段行。
  这是当前实现，本轮**没有**证明越权访问，也不是本轮引入的新回归。
- 第 6–7 行是**同步读取**：活跃行与墓碑分开，墓碑只下发 id。

## 2. 阶段软删写入 / 恢复链路

| 项目 | 结论 | 证据 |
|---|---|---|
| API 可达的阶段软删 | **存在**：`POST /api/sync/push` 的 `op=delete`（entity=projectPhases） | `sync.js:217-225`（要求独立删除权限 `project_phases.delete`，不复用 update）；`sync.js:596-609`（写 `deletedAt = now()`、`updatedById`） |
| 普通 REST 的阶段资源 DELETE | `lookupResult=NOT_FOUND`：`phases.js` 没有 `delete('/:id')` | `phases.js` 路由清单：`get('/')`、`post('/')`、`get('/:id')`、`put('/:id')`、`post('/:id/transitions')`、`delete('/:id/transitions/:toPhaseId')` |
| 阶段资源 restore | `lookupResult=NOT_FOUND`：无恢复端点；同步 upsert 到已墓碑行时通用更新**不清** `deletedAt` | `sync.js:653-673`（`writeData` 只含客户端字段 + `updatedById`） |
| 阶段流转边 DELETE（易混淆项） | **存在**，但删的是 `PhaseTransition` 边，不是阶段实例 | `phases.js:194` `DELETE /:id/transitions/:toPhaseId` |
| 项目 scope 保护 | 阶段读取都经过 `resolveProjectAccess`：项目软删或非成员 → 404 | `projectAccess.js:21-28`（`!project \|\| project.deletedAt` → `PROJECT_NOT_FOUND`） |
| 测试里的墓碑来源 | `rp08` B3 用例的软删阶段是**测试直接写库**（fixture 设置 `deletedAt`），不是通过 API 删除 | `rp08-sync-read-authorization.integration.test.mjs` B3（`prisma.projectPhase.create({ ... deletedAt })`） |

结论：**API 可达阶段软删 = 仅同步 push 的 delete 操作**；不存在阶段资源 DELETE/restore 端点。
「phases.js 完全没有 DELETE 路由」的说法不成立（有流转边 DELETE），必须区分。

## 3. 直接客户端调用链（一层）

| 环节 | 事实 | 证据 |
|---|---|---|
| 请求封装 | `frontend/src/api/endpoints/projects.ts:39` 定义 `phases: (id) => get('.../phases')` | `projects.ts:39` |
| 该封装的直接调用者 | **未找到**（在 `frontend/src` 范围内定向检索 `projectAPI.phases` / `.phases(` 命中 0） | `lookupResult=NOT_FOUND`，检索范围 `rdpms-system/frontend/src` |
| 项目详情实际调用 | `ProjectDetail.tsx:51` 调用 `projectAPI.get(id)`，并用 `progressAPI.get` | `ProjectDetail.tsx:51` |
| 进度条渲染来源 | `ProjectDetail.tsx:198` 把 `template` 与 `tasks` 传给 `PhaseProgressBar`；组件 `PhaseProgressBar.tsx:40` 从 `template.content.phases` 派生（模板阶段，过滤 `enabled !== false`） | `ProjectDetail.tsx:198`、`PhaseProgressBar.tsx:32-40` |
| 实际 UI 是否展示软删阶段实例 | **NOT_RUN**（无浏览器验收）；且模板阶段 ≠ `ProjectPhase` 实例，不能互相替代 | 本轮未启动浏览器/UI |

## 4. 合同来源分级

| 结论类型 | 来源 | 状态 |
|---|---|---|
| 同步活跃/墓碑分离、墓碑只下发 id | 当前实现（`sync.js`） | `CURRENT_IMPLEMENTATION` |
| 普通阶段读取应否过滤 `deletedAt` | **无具名批准来源** | `CONTRACT_UNRESOLVED` |
| 项目级软删范围（list/count/search/stats/detail/回收站） | `AC-B20-01/02/03`、`PAC-RP04-03` | 已存在的项目级定义（见 scope-assessment.md） |
| 阶段 UI 展示 | 无浏览器/UI 验收 | `NOT_RUN` |

本文件不因“普通阶段读取返回软删行”而断言存在越权泄露或新的 B20 回归；
也不因当前实现而推定已批准阶段过滤政策。
