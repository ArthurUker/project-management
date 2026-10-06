# 下一步建议（SUP-03 / LR5-03，只给有证据的选项，不含业务 patch）

本文件只提交**建议**，不实施、不创建或激活实施任务、不代签任何 PENDING/PROPOSED 决定。
所有选项都在 `KEEP_CURRENT` / `SCOPED_FIX` / `CONTRACT_CLARIFICATION` 三类中给出。

## 选项 A：KEEP_CURRENT（保持当前实现）

- 含义：普通阶段读取继续返回软删阶段实例；同步侧继续活跃/墓碑分离。
- 证据：`projects.js:341/820-823`、`phases.js:39/45-49/94` 无 `deletedAt` 过滤；`sync.js:428-469` 已分离。
- 影响入口：`GET /api/projects/:id`（内嵌 phases）、`GET /api/projects/:id/phases`、`GET /api/phases?projectId=`、`GET /api/phases`（全局）、`GET /api/phases/:id`。
- 前提：需要一份**具名批准**说明“阶段实例读取允许包含软删行”，否则该状态仍是 `CONTRACT_UNRESOLVED`。
- 未来验收（若日后批准）：明确列出哪些入口允许哪些角色看到软删阶段，并用自有库动态验证。

## 选项 B：SCOPED_FIX（有范围的最小改动）

- 含义：仅在**阶段读取入口**加 `deletedAt` 过滤，不改项目级 B20 语义，不改同步投影，不改前端。
- 最小候选改动（文字描述，非 patch）：
  1. `projects.js:341` 详情内嵌 `phases` 增加 `where: { deletedAt: null }`；
  2. `projects.js:820-823` 阶段列表 `where` 增加 `deletedAt: null`；
  3. `phases.js:39`（带 projectId）与 `phases.js:45-49`（全局）增加 `deletedAt: null`；
  4. `phases.js:94` 详情对 `deletedAt` 非空返回 404（或保持返回但显式登记例外）。
- 未决问题：若阶段实例目前**只能**通过同步 push 的 `op=delete` 软删、且没有 restore 端点，
  过滤后客户端将只能通过墓碑感知删除——需要确认离线客户端是否有恢复路径（`CONTRACT_UNRESOLVED`）。
- 未来验收：每个入口在自有库验证「软删阶段不出现在普通读取、仍出现在同步 tombstones」。
- 所需批准/授权：需要明确授权修改 `projects.js` / `phases.js`（**本轮未获得，也未执行**）。

## 选项 C：CONTRACT_CLARIFICATION（先澄清合同）

- 含义：在改动之前，先由具名来源裁定阶段实例读取是否必须过滤 `deletedAt`，
  以及 `GET /api/phases/:id` 是否应补充 `assertProjectCapability('read')`（当前只有权限码、无能力断言）。
- 证据：`phases.js:92-99` 只做 `resolveProjectAccess` + `auditElevatedIfNeeded`，未调用 `assertProjectCapability`；
  `phases.js:42-50` 全局列表同样没有能力断言。
- 未来验收：裁定文档 + 与裁定一致的动态用例。
- 所需批准：产品/安全口径批准（本轮不存在）。

## 明确不在本轮范围

- 不实施阶段过滤、恢复功能、前端改动、schema 或迁移。
- 不修改 `projects.js`、`phases.js`、`sync.js` 或任何业务源码（本轮源码改动数 = 0，由 final-integrity 核对）。
- 不重开 B20，不把 B20 改成阶段规则，不新增阶段端点动态探针、浏览器或 UI 验收。
- 不为以上任何选项创建或激活实施任务。
