# SUP-03 变更摘要（REVIEW_ONLY）

本项**没有修改任何仓库既有文件**：不改动 `backend/src`、`frontend/src`、schema、迁移、
其他正式测试或共享 helper。增量只在本 session 目录内新增文档与证据。

## 1. 补齐上一轮遗漏的入口（LR5-03）

- `GET /api/projects/:id` 详情内嵌 `phases`（`projects.js:328/341`）：聚合未过滤 `deletedAt`。
- `GET /api/phases`（无 projectId 的全局列表，`phases.js:42-50`）：走 `projectVisibilityFilter`、
  `take: 500`，未过滤 `deletedAt`。

## 2. 直接客户端调用链（一层）

- `projects.ts:39` 只定义访问器；在 `frontend/src` 定向检索 `projectAPI.phases` / `.phases(` 命中 0
  → `lookupResult=NOT_FOUND`（封装存在不等于实际调用）。
- `ProjectDetail.tsx:51` 实际调用 `projectAPI.get(id)`；`ProjectDetail.tsx:198` 把 `template` 与 `tasks`
  传给 `PhaseProgressBar`；`PhaseProgressBar.tsx:32-40` 从 `template.content.phases` 派生
  （**模板阶段**，不是 `ProjectPhase` 实例列表）。
- 实际页面是否显示软删阶段实例：`NOT_RUN`（无浏览器验收；静态不能代动态）。

## 3. 写入 / 恢复链路与易混淆项

- API 可达阶段软删：`POST /api/sync/push` 的 `op=delete`（`sync.js:217-225`、`596-609`），
  独立权限 `project_phases.delete`。
- 阶段资源 DELETE / restore：`NOT_FOUND`（`phases.js` 无 `delete('/:id')`、无 restore；
  同步 upsert 到已墓碑行不清 `deletedAt`，见 `sync.js:653-673`）。
- `phases.js:194` `DELETE /:id/transitions/:toPhaseId` 删的是 **PhaseTransition 边**，
  不是阶段实例——不得笼统说“文件无 DELETE 路由”。

## 4. 合同范围（B20）

- 引用 `AC-B20-01/02/03`、`PAC-RP04-03` 原文：全部是**项目级**软删范围
  （list / count / search / stats / detail / 回收站），不覆盖阶段实例过滤。
- 不自动把 B20 扩大为阶段规则，也不因普通阶段视图例外重新打开 B20。
- 阶段过滤政策无具名批准来源 → `CONTRACT_UNRESOLVED`。

## 5. 建议

只给 `KEEP_CURRENT` / `SCOPED_FIX` / `CONTRACT_CLARIFICATION` 三类中**有证据**的选项，
见 `deliverables/next-action.md`；不写业务 patch，不创建或激活实施任务。
