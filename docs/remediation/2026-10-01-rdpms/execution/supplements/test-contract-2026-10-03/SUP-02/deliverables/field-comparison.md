# SUP-02 字段对照表（七实体）

来源：`tests/integration/rp08-sync-read-authorization.integration.test.mjs` 的 SUP-02 用例（动态校验，非静态断言）。
对照方法：普通 API 返回真实活跃行 → 按 id 提取 → 与同步 upsert 同一 id 行逐键比较；禁止字段按 `SYNC_READ_MATRIX[entity].forbidden` 不存在断言。

| 实体 | 普通 API 入口 | 同步实体键 | 对照方式 | 禁止字段（示意） |
|---|---|---|---|---|
| projects | GET /api/projects/:id | changes.projects.upserts | 逐键 deepEqual；manager 逐键比较在线同一对象 | code/templateId/metadata/createdById/updatedById/deletedAt |
| projectPhases | GET /api/projects/:id/phases | changes.projectPhases.upserts | 逐键 deepEqual | createdById/updatedById/deletedAt |
| tasks | GET /api/projects/:id/tasks | changes.tasks.upserts | 逐键 deepEqual | createdById/updatedById/deletedAt/reviewerId/嵌入的 assignee·phase·regulatoryDocuments |
| milestones | GET /api/projects/:id/milestones | changes.milestones.upserts | 逐键 deepEqual | createdById/updatedById/deletedAt/completedAt |
| monthlyProgress | GET /api/progress?projectId=:id | changes.monthlyProgress.upserts | 逐键 deepEqual | submittedById 等服务端权威；createdById/updatedById/deletedAt |
| reports | GET /api/projects/:id/reports | changes.reports.upserts（ownOnly） | 逐键 deepEqual | reviewerId/审阅字段/createdById/updatedById/deletedAt |
| projectMembers | GET /api/projects/:id/members（裸数组） | changes.projectMembers.upserts | 逐键 deepEqual；leftAt 语义 | leftAt/updatedById/createdById/metadata |

> 说明：禁止字段集合以 `SYNC_READ_MATRIX[entity].forbidden` 为准（运行时动态断言），上表为示意。
> 每实体均先证明普通 API 200 + 同步 200 且目标行非空，再运行移除读权限的负例（普通 API 403；同步 upserts/tombstones 空）。
> 当前对照仅作为 READ_COMPARISON 证据；独立产品或安全字段政策批准仍 NOT_EVALUATED。
