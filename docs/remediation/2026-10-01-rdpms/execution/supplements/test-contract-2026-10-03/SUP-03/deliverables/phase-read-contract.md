# 阶段（ProjectPhase）软删合同 — 定向核对

> 来源：REVIEW_ONLY 定向读取直接调用链。所有结论为 CURRENT_IMPLEMENTATION 或已批准合同，非独立产品/安全政策批准。

## 1. 数据模型
- `ProjectPhase`：`deletedAt DateTime?`（schema.prisma:757），`@@index([status, deletedAt])`（772）—— 软删由 schema 支撑。

## 2. 普通 API 读取（READ）
| 入口 | 位置 | deletedAt 过滤 | 结果 |
|---|---|---|---|
| `GET /api/projects/:id/phases` | projects.js:820 | 否 | 返回软删阶段（泄漏） |
| `GET /api/phases/`（按 projectId） | phases.js:39 | 否 | 返回软删阶段（泄漏） |
| `GET /api/phases/:id` | phases.js:94 | 否（findUnique） | 软删单条亦返回 |
| 对照 `GET /api/projects/:id/milestones` | projects.js:808 | 是 `deletedAt: null` | 正确过滤 |

权限：`project_phases.view`；项目 scope 由 `resolveProjectAccess` 约束。

## 3. 同步读取（READ，正确）
- upserts：`aliveFilter = { deletedAt: null }`（sync.js:428-430）
- tombstones：`{ deletedAt: { not: null } }`（sync.js:453）
- 结论：软删阶段不进入 upserts，作为 tombstone 下发 —— 符合已批准软删合同。

## 4. 软删写入（WRITE）
- 普通 phases API：**无 DELETE 路由**（phases.js 仅 GET/POST/PUT/PATCH status/transitions）—— 不能经普通 API 软删。
- 离线同步 push `op:'delete'`：sync.js:596-609 置 `{ deletedAt: new Date() }`，需 `project_phases.delete`（sync.js:71 def）。
- 结论：软删**写仅经同步 push（授权）可达**；API 可达软删写 = 同步路径，非 phases API。
- 区分：API 可达软删**读**（普通列表泄漏，见 §2）与 API 可达软删**写**（仅同步 push）。

## 5. 恢复（RECOVER）
- 普通 phases API 无恢复端点；同步 upsert（op≠delete）不清除 `deletedAt`（sync.js:617+ 仅 apply def.fields）。
- 结论：恢复**无 API 可达路径** → `CONTRACT_UNRESOLVED`。

## 6. 前端（CLIENT）
- `projects.ts:39` `phases(id)` 直接消费 `/projects/:id/phases`，未见 deletedAt 去重 → 若后端泄漏软删行，前端将展示。CURRENT_IMPLEMENTATION，非批准合同。

## 7. 合同裁定
- 读取过滤缺失：无权威合同明确要求 phase 读过滤 deletedAt；与 milestones 不一致，疑似应有统一模式，但来源不明 → `CONTRACT_UNRESOLVED`。
- 同步软删：已批准合同，实现正确。
- 写/恢复：写经同步 push 可达（授权）；恢复不可达（CONTRACT_UNRESOLVED）。
- 未对 projects.js 添加过滤、未改前端、未生成业务 patch。
