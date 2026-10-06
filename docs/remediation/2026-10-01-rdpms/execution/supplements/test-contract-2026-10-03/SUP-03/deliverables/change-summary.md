# SUP-03 变更摘要（REVIEW_ONLY，阶段软删合同核对）

- 关联：RP04 / RP08（LR4-04 / B20），模式 REVIEW_ONLY
- 执行日期：2026-10-03，仅定向读取以下直接调用链，未修改任何业务源码 / schema / 前端 / helper。

## 读取范围（直接调用链）
- `backend/prisma/schema.prisma`：ProjectPhase 模型（行 741-774），含 `deletedAt`（757），索引 `@@index([status, deletedAt])`（772）。
- `backend/src/routes/projects.js`：
  - `GET /:id/phases`（行 814-825）：`findMany({ where: { projectId: id }, orderBy })` —— **未过滤 `deletedAt`**。
  - 对照 `GET /:id/milestones`（行 801-812）：`findMany({ where: { projectId: id, deletedAt: null } })` —— **已过滤**。两者不一致。
- `backend/src/routes/phases.js`：
  - `GET /`（行 31-51）：`findMany({ where: { projectId } })` —— **未过滤 `deletedAt`**。
  - `GET /:id`（行 92-99）：`findUnique` —— 无过滤，软删行亦返回。
  - **无 DELETE 路由**（仅 GET/POST/PUT/PATCH status/transitions），故普通 phases API **不能软删阶段**。
- `backend/src/routes/sync.js`：
  - 读取：`aliveFilter = { deletedAt: null }`（行 428-430）用于 upserts；`tombstones = { deletedAt: { not: null } }`（行 453）—— 同步侧**正确**区分活跃/墓碑。
  - 写入：`op:'delete'`（行 596-609）对 projectPhases 执行 `{ deletedAt: new Date() }`，需 `deletePermission: 'project_phases.delete'`（def 行 71）—— 软删**写仅经离线同步 push 可达**。
  - 恢复：upsert（op≠delete）走共享应用命令（行 617+），**不清除 `deletedAt`** —— 恢复路径普通 API / 标准同步 upsert **不可达**。
- `frontend/src/api/endpoints/projects.ts`：
  - `phases: (id) => get('/projects/${id}/phases')`（行 39）—— 直接使用泄漏列表，未见客户端 deletedAt 去重。

## 合同性质
- 普通 API 阶段读取含软删行：**当前实现（CURRENT_IMPLEMENTATION）**，无权威合同明确要求过滤；与 milestones 行为不一致。标记为 `CONTRACT_UNRESOLVED`，不自行选择默认过滤政策。
- 同步侧软删处理：**已批准合同（软删经 deletedAt 派生 tombstone）**，实现正确。
- 软删写：**仅经同步 push（project_phases.delete 授权）可达**，非 phases API。
- 恢复：**无 API 可达路径**（CONTRACT_UNRESOLVED）。

## 交付
- `phase-read-contract.md`、`scope-assessment.md`、`next-action.md`、`coverage.csv`、`evidence/source-trace.md`
- 7 类交付结构（authorization/change-summary/acceptance/rollback/task-state/handoff/evidence）
- 未做任何代码改动；发布保持 NOT_EVALUATED。
