# SUP-03 源调用链追溯（只读）

| 关注点 | 文件:行 | 代码片段 / 行为 |
|---|---|---|
| 阶段模型 deletedAt | prisma/schema.prisma:757,772 | `deletedAt DateTime? @map("deleted_at")`；`@@index([status, deletedAt])` |
| 普通 API 阶段列表（无过滤） | src/routes/projects.js:820 | `prisma.projectPhase.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } })` |
| 对照：里程碑列表（有过滤） | src/routes/projects.js:808 | `prisma.milestone.findMany({ where: { projectId: id, deletedAt: null }, ... })` |
| 普通 API /phases/（无过滤） | src/routes/phases.js:39 | `prisma.projectPhase.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } })` |
| 普通 API /phases/:id（无过滤） | src/routes/phases.js:94 | `prisma.projectPhase.findUnique({ where: { id } })` |
| phases 无 DELETE 路由 | src/routes/phases.js:21-206 | 仅 GET/POST/PUT/PATCH status/transitions |
| 同步读取 aliveFilter | src/routes/sync.js:428-430 | `aliveFilter = def.tombstoneField === 'leftAt' ? { leftAt: null } : { deletedAt: null }` |
| 同步 tombstones | src/routes/sync.js:453 | `streamPageWhere(scopeWhere, { [def.tombstoneField]: { not: null } }, ...)` |
| 同步 push 软删写 | src/routes/sync.js:596-609 | `op === 'delete'` → `{ deletedAt: new Date() }`；需 `def.deletePermission` |
| 阶段 delete 权限 | src/routes/sync.js:71 | `deletePermission: 'project_phases.delete'` |
| 同步 upsert 不清除 deletedAt | src/routes/sync.js:617+ | 仅 apply `def.fields`，未置 `deletedAt: null` |
| 前端消费 | frontend/src/api/endpoints/projects.ts:39 | `phases: (id) => get('/projects/${id}/phases')` |

> 以上为 REVIEW_ONLY 定向读取，未对任一文件做改动。
