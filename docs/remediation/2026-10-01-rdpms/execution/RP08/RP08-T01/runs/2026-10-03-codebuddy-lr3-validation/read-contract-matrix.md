# 读合同矩阵（普通 API ↔ 同步）— RP08-T01 / LR3-02

来源：**当前工作区普通 API 实现与既有同步实现**（本轮开始时 worktree）。本文件不是"已批准字段清单"，
也不把 `SYNC_ENTITIES` 自身当作批准依据；两者只作为"当前实现"被对照。行号对应本轮开始时的
`rdpms-system/backend/src/routes/*.js`（见 change-summary 的源码 hash）。

| 实体 | 普通 API 入口 | 权限 | 项目作用域来源 | 普通 API 字段来源 | 同步映射来源 | own-only | 墓碑规则 | 增量时间戳 | 本轮用例 |
|---|---|---|---|---|---|---|---|---|---|
| projects | GET /api/projects/:id | projects.view | projects.js:328 + :332 resolveProjectAccess | projects.js:335-357（include manager/template/members/phases/tasks/milestones/monthlyProgress + myCapabilities） | sync.js:43-57（readPermission :52、readFields :53） | 否 | deletedAt | updatedAt | B1 / B4 |
| projectPhases | GET /api/projects/:id/phases | project_phases.view | projects.js:814 + :817 + :819 assertProjectCapability(read) | projects.js:820-823 → {projectId,list,total} | sync.js:58-73（:67/:68） | 否 | deletedAt | updatedAt | B1 |
| tasks | GET /api/projects/:id/tasks | tasks.view | projects.js:767 + :770 + :772 | projects.js:773-786（include assignee/phase/regulatoryDocuments） | sync.js:74-95（:83/:84） | 否 | deletedAt | updatedAt | B1 / B4 |
| milestones | GET /api/projects/:id/milestones | milestones.view | projects.js:801 + :804 + :806 | projects.js:807-811 → {projectId,list,total} | sync.js:96-113（:105/:106） | 否 | deletedAt | updatedAt | B1 |
| monthlyProgress | GET /api/progress?projectId= | progress.view | progress.js:159 + :161-166 projectVisibilityFilter | progress.js:168-176（include project） | sync.js:114-128（:123/:124） | 否 | deletedAt | updatedAt | B1 |
| reports | GET /api/projects/:id/reports | reports.view | projects.js:787 + :790 + :792 | projects.js:793-798（include author{id,displayName}） | sync.js:129-146（ownOnly :132、:140、:141） | **是**（authorId=self） | deletedAt | updatedAt | B1 / B2 / B3 |
| projectMembers | GET /api/projects/:id/members | projects.view | projects.js:703 + :706 | projects.js:707-711（leftAt null，include user 五字段） | sync.js:147-163（leftAt :151、joinedAt :152、:158） | 否 | leftAt | joinedAt | B1 / B3 |

## 对照规则（本轮实际采用）

1. **实体门控相同**：普通 API 的 `requirePermission(<readPermission>)` 与同步 `readPermission` 一一对应；
   去掉该权限时普通 API 403，同步对应实体 upserts/tombstones 为空（B1 实测）。
2. **项目作用域相同**：普通 API 走 `resolveProjectAccess`/`projectVisibilityFilter`（成员/负责人；SUPER_ADMIN 全量），
   同步走 `projectVisibilityFilter` + 成员 read 能力判定；退出成员后两侧同时不可见（B1 实测）。
3. **字段是子集，不是相等**：普通 API 返回的字段通常更多（含聚合与关联对象），同步只返回
   `readFields` 白名单；本轮只断言"同步键 ⊆ 普通 API 键"+"明确禁止字段永不出现"，不要求整个 JSON 相等。
4. **reports own-only 是同步的额外限制**：普通 API 的项目内汇报列表对有 read 能力的成员返回全部作者，
   同步额外按 `authorId = 当前用户` 过滤（B2 实测：SUPER_ADMIN 本人报告非空可见，他人报告不可见）。
5. **墓碑**：普通 API 读取一律 `deletedAt: null` / `leftAt: null`（活跃视图），同步额外返回墓碑 ID 列表；
   无权限时两侧都不得泄漏该 ID（B3 实测）。
6. **缺口登记**：普通 API 侧没有"字段级授权合同"文档（只定义了路由级权限与 select 形状），
   因此字段级授权只能以"当前实现的 select/include"为参照，缺少独立批准来源；本轮不发明新字段规则。
