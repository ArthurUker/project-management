# SUP-02 七实体精确行字段对照（当前实现对照）

- 来源：`SUP-02-01/02/03 (RP08 LR4-02 rework)`，证据 `SUP-02/runs/rp08-suite/attempt-03/integration-suite.log`、`SUP-02/runs/rp08-suite/attempt-03/run-results.json`
- 口径：`CURRENT_IMPLEMENTATION_COMPARISON`。同步读投影与普通 API 读投影均按**当前实现**核对，
  独立的产品/安全字段政策批准为 `NOT_EVALUATED`，本表不构成批准。
- 正例与拒例使用**同一真实 actor**：同一 userId、同一 systemRole、成员资格不变、报告作者归属不变，
  只移除该实体的目标读权限（权限差集 = 目标项）。
- 旧交付 errata 纠正：`code` / `templateId` / `completedAt` / `submittedById` / `reviewNote` / `reviewedAt`
  等字段在**当前读投影中是允许字段**，不能列入禁止字段；「读取投影允许字段」与「客户端禁止写入字段」
  必须分开，本表只描述读投影。

## 逐实体汇总

| entity | ordinary entrypoint | response shape | read permission | target row id | sync field count | forbidden checked (all absent) | same-actor denial | sync source | ordinary source |
|---|---|---|---|---|---|---|---|---|---|
| `projects` | `/api/projects/e5fc4e2a-b851-48bf-a1fd-effa4592ef8f` | single-object | `projects.view` | `e5fc4e2a-b851-48bf-a1fd-effa4592ef8f` | 16 | `metadata`, `createdById`, `deletedAt`, `updatedById`, `description` | removed=projects.view, ordinary=403, upserts=0, tombstones=0 | `rdpms-system/backend/src/routes/sync.js:53` | `rdpms-system/backend/src/routes/projects.js:328` |
| `projectPhases` | `/api/projects/e5fc4e2a-b851-48bf-a1fd-effa4592ef8f/phases` | list-object | `project_phases.view` | `3d536798-b183-492f-a71f-03c7bb755d37` | 16 | `createdById`, `deletedAt`, `updatedById` | removed=project_phases.view, ordinary=403, upserts=0, tombstones=0 | `rdpms-system/backend/src/routes/sync.js:68` | `rdpms-system/backend/src/routes/projects.js:814` |
| `tasks` | `/api/projects/e5fc4e2a-b851-48bf-a1fd-effa4592ef8f/tasks` | list-object | `tasks.view` | `rp08m-task-86e848c0-cabb-429b-a2f1-b86bf1883ef1` | 26 | `createdById`, `deletedAt`, `updatedById` | removed=tasks.view, ordinary=403, upserts=0, tombstones=0 | `rdpms-system/backend/src/routes/sync.js:84` | `rdpms-system/backend/src/routes/projects.js:767` |
| `milestones` | `/api/projects/e5fc4e2a-b851-48bf-a1fd-effa4592ef8f/milestones` | list-object | `milestones.view` | `6020d7d3-a67f-4be1-9ed1-5474dd2d43f1` | 10 | `createdById`, `deletedAt`, `updatedById` | removed=milestones.view, ordinary=403, upserts=0, tombstones=0 | `rdpms-system/backend/src/routes/sync.js:106` | `rdpms-system/backend/src/routes/projects.js:801` |
| `monthlyProgress` | `/api/progress?projectId=e5fc4e2a-b851-48bf-a1fd-effa4592ef8f` | list-object | `progress.view` | `1bee06e3-2962-4cfd-a606-67f5ece2d8a1` | 12 | `createdById`, `deletedAt`, `updatedById` | removed=progress.view, ordinary=403, upserts=0, tombstones=0 | `rdpms-system/backend/src/routes/sync.js:124` | `rdpms-system/backend/src/routes/progress.js:159` |
| `reports` | `/api/projects/e5fc4e2a-b851-48bf-a1fd-effa4592ef8f/reports` | list-object | `reports.view` | `rp08m-report-member-86e848c0-cabb-429b-a2f1-b86bf1883ef1` | 15 | `deletedAt`, `reviewerId`, `updatedById`, `createdById` | removed=reports.view, ordinary=403, upserts=0, tombstones=0 | `rdpms-system/backend/src/routes/sync.js:141` | `rdpms-system/backend/src/routes/projects.js:787` |
| `projectMembers` | `/api/projects/e5fc4e2a-b851-48bf-a1fd-effa4592ef8f/members` | bare-array | `projects.view` | `f417e4f3-d187-4bef-a928-34705c2d700d` | 5 | `leftAt`, `createdById`, `updatedById` | removed=projects.view, ordinary=403, upserts=0, tombstones=0 | `rdpms-system/backend/src/routes/sync.js:158` | `rdpms-system/backend/src/routes/projects.js:703` |

## 同步字段名（按键排序）

- `projects`（16 个键）：`actualEndDate`, `code`, `createdAt`, `endDate`, `id`, `isDraft`, `manager`, `managerId`, `name`, `positioning`, `startDate`, `status`, `subtype`, `templateId`, `type`, `updatedAt`
- `projectPhases`（16 个键）：`actualEnd`, `actualStart`, `code`, `createdAt`, `id`, `isMilestone`, `name`, `notes`, `plannedEnd`, `plannedStart`, `progressPercent`, `projectId`, `sortOrder`, `status`, `templatePhaseId`, `updatedAt`
- `tasks`（26 个键）：`actualHours`, `applicability`, `assigneeId`, `code`, `completedAt`, `createdAt`, `description`, `dueDate`, `estimatedHours`, `expectedDeliverable`, `id`, `parentId`, `phaseId`, `priority`, `progressPercent`, `projectId`, `regulatoryNotes`, `regulatoryPriority`, `sortOrder`, `startDate`, `startedAt`, `status`, `taskType`, `templateTaskId`, `title`, `updatedAt`
- `milestones`（10 个键）：`completedAt`, `createdAt`, `description`, `dueDate`, `id`, `name`, `phaseId`, `projectId`, `status`, `updatedAt`
- `monthlyProgress`（12 个键）：`actualWork`, `completionPercent`, `createdAt`, `id`, `nextPlan`, `periodKey`, `projectId`, `projectStatus`, `risks`, `submittedAt`, `submittedById`, `updatedAt`
- `reports`（15 个键）：`authorId`, `content`, `createdAt`, `currentVersion`, `id`, `periodEnd`, `periodKey`, `periodStart`, `projectId`, `reportType`, `reviewNote`, `reviewedAt`, `status`, `submittedAt`, `updatedAt`
- `projectMembers`（5 个键）：`id`, `joinedAt`, `projectId`, `role`, `userId`

## 精确键值对照

逐字段对照见同目录 `field-comparison.csv`（共 101 行，全部 `exactMatch=true`）。
每个键都取自**同一在线行的同一条持久记录**；`manager.*` 等较窄嵌套投影逐键比较在线同一对象，
不要求整个响应相等，也不使用整段 JSON 子串搜键或另一行字段代替。

## 已知例外（如实记录，不修业务去迎合）

- 普通阶段列表当前会返回软删行（阶段实例读取的既有行为）；同步侧把软删行放入 `tombstones`，
  这是当前实现，本轮不实施过滤、恢复或前端改动。
- `reports` 的 own-only 是同步侧的额外限制：普通 API 对同一项目返回全部作者，两侧合法结果不要求相等。
- 合成值可保存；本轮全部使用自有库合成 actor，不涉及真实凭据。
