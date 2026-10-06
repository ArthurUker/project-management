# CLOSE-04 / LR6-04：阶段读取 scope 摘要勘误（STATIC_REVIEW / 文档订正）

本文件只订正上一会话 SUP-03 交付中的**两句概括**，不改任何业务源码、不新增过滤、
不重开 B20、不重做入口表。层次：`STATIC_REVIEW`；动态阶段 API、浏览器/UI、真实客户端运行
保持 `NOT_RUN`；阶段软删/过滤政策保持 `CONTRACT_UNRESOLVED`。

## 1. 被勘误的两句原文（逐字引用）

| 位置 | 原文 |
|---|---|
| `execution/supplements/test-contract-rework-2026-10-03-cb1/SUP-03/deliverables/phase-read-contract.md:32` | 「项目 scope 保护 \| 阶段读取都经过 `resolveProjectAccess`：项目软删或非成员 → 404 \| `projectAccess.js:21-28`（`!project \|\| project.deletedAt` → `PROJECT_NOT_FOUND`）」 |
| `execution/supplements/test-contract-rework-2026-10-03-cb1/SUP-03/deliverables/scope-assessment.md:20` | 「项目 scope 对阶段是否仍生效 \| **是**。所有阶段读取入口都经过 `resolveProjectAccess`，项目软删或非成员 → 404 \| `projectAccess.js:21-28`；`phases.js:36/96`；`projects.js:817`」 |

两句把**全部**阶段读取入口说成统一 `resolveProjectAccess` + 统一 404，与源码不符。

## 2. 订正一：带 projectId 的单项目读取（先 resolve，再能力断言）

事实（当前源码）：

- `phases.js:32` `GET /api/phases?projectId=…`：先 `resolveProjectAccess(prisma, auth, projectId)`（`phases.js:36`），
  再 `auditElevatedIfNeeded`，再 `assertProjectCapability(access, 'read', 'project_phases.view')`（`phases.js:38`），
  然后 `findMany({ where: { projectId } })`（`phases.js:39`）。
- `resolveProjectAccess`（`projectAccess.js:21-28`）：项目不存在或 `deletedAt` 非空 → `PROJECT_NOT_FOUND`（404）；
  非成员在后续判定中同样拒绝。

订正表述：**带 `projectId` 的入口**先按项目做访问解析，项目软删/不可见/非成员时以 404 拒绝；
通过后才做阶段能力断言并返回该项目阶段。这是**单项目资源的拒绝行为**，
不能推广为“所有阶段入口都 404”。

## 3. 订正二：不带 projectId 的全局列表（可见性过滤，非逐项 404）

事实（当前源码）：

- `phases.js:42-50`（无 `projectId` 分支）：动态导入并使用 `projectVisibilityFilter(auth)`（`phases.js:44`），
  查询 `where: visible ? { project: visible } : {}`、`orderBy: [{projectId:'asc'},{sortOrder:'asc'}]`、`take: 500`（`phases.js:45-49`）。
- `projectVisibilityFilter`（`projectAccess.js:97-104`）：`SUPER_ADMIN` 返回 `null`（即不附加过滤条件）；
  其他 actor 返回 `{ OR: [{ managerId: auth.userId }, { members: { some: { userId: auth.userId, leftAt: null } } }] }`
  ——即「本人为 manager 或仍为**有效成员**」。

订正表述：**全局列表**对普通 actor 返回 manager/活跃成员可见范围内的阶段；
`SUPER_ADMIN` 可返回**不带该可见性过滤**的列表。该过滤条件**不检查 `project.deletedAt`**
（`projectAccess.js:97-104` 无 `deletedAt` 条件），因此不能把全局分支描述为逐项 `resolveProjectAccess` 或统一 404。

## 4. 订正后的合并表述（与入口表一致）

| 分支 | scope 处理 | 拒绝/范围语义 |
|---|---|---|
| `GET /api/phases?projectId=…`（`phases.js:32-41`）、`GET /api/projects/:id/phases`（`projects.js:814-825`）、`GET /api/phases/:id`（`phases.js:92-99`） | 单项目：`resolveProjectAccess`（+ 列表分支 `assertProjectCapability('read')`） | 项目不存在/软删/非成员 → 404 |
| `GET /api/phases`（无 `projectId`，`phases.js:42-50`） | 全局：`projectVisibilityFilter`（`projectAccess.js:97-104`） | 普通 actor：manager 或 `leftAt IS NULL` 成员的项目阶段；`SUPER_ADMIN`：无该过滤；**无 `project.deletedAt` 条件** |

## 5. 保持不变的结论与边界

- 阶段软删政策：`CONTRACT_UNRESOLVED`（没有具名批准来源规定普通阶段读取必须过滤 `deletedAt`）。
- B20 原范围（`AC-B20-01/02/03`、`PAC-RP04-03`）仍为**项目级** list/count/search/stats/detail/回收站，未扩大。
- 本轮**未**实施阶段过滤、恢复、权限或前端改动；业务源码改动数 = 0。
- 动态阶段 API、UI、真实客户端：`NOT_RUN`（未在本轮运行）；本轮结论均为静态源码核对 + 原证据引用。
- 现有入口/客户端/B20 材料按原证据引用（`phase-read-contract.md`、`scope-assessment.md`、`coverage.csv`），不重做全表。
