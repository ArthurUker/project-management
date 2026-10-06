# CLOSE-04 变更摘要（STATIC_REVIEW / 文档勘误）

只新增一份勘误文档：`execution/supplements/lr6-closeout-2026-10-04-cb1/CLOSE-04/scope-errata.md`。业务源码、前端、schema、其他测试零改动。

## 订正内容

1. **带 projectId 的单项目读取**：`phases.js:32` 分支先 `resolveProjectAccess`（`phases.js:36`）、
   `auditElevatedIfNeeded`，再 `assertProjectCapability('read','project_phases.view')`（`phases.js:38`），
   然后 `findMany({ where: { projectId } })`（`phases.js:39`）；项目不存在/软删/非成员 → 404。
   这是**单项目资源**的拒绝行为，不能推广为“所有阶段入口统一 404”。
2. **不带 projectId 的全局列表**：`phases.js:42-50` 使用 `projectVisibilityFilter`（`phases.js:44`），
   过滤条件来自 `projectAccess.js:97-104`：`SUPER_ADMIN` → `null`（不附加过滤）；其他 actor →
   「本人为 manager 或 `leftAt IS NULL` 的活跃成员」。该条件**不检查 `project.deletedAt`**，
   因此全局分支既不是逐项 `resolveProjectAccess`，也不是统一 404。

被勘误的两句原文（旧会话 SUP-03 交付）：
- `execution/supplements/test-contract-rework-2026-10-03-cb1/SUP-03/deliverables/phase-read-contract.md:32`
- `execution/supplements/test-contract-rework-2026-10-03-cb1/SUP-03/deliverables/scope-assessment.md:20`

## 保持

- 阶段软删/过滤政策：`CONTRACT_UNRESOLVED`；B20 原范围仍为项目级。
- 动态阶段 API/UI/真实客户端：`NOT_RUN`。
- 未实施阶段过滤、恢复、权限或前端改动（违反即超出授权）。
