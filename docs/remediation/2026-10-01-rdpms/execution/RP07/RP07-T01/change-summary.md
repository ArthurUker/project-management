# RP07-T01 — HTTP/sync 项目状态共享规则与归档权限

## 状态

- 子任务：`implementation COMPLETE`；`validation ENV_BLOCKED`；`release NOT_EVALUATED`。
- B09（P1）仍为 `SUPPORTED` / 未 `FIX_ACCEPTED`。R06-N01（P2）属于 RP07-T02 的负责人转移任务；本任务没有关闭该 finding。
- HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。RP07-T01 起点的 `projects.js` 与 `sync.js` 摘要分别精确匹配 RP05-T01 任务终点；所有起止 hash 及新文件 hash 在 `evidence/source-digest-comparison.json`。

## 实施差异

- 新增共享项目状态命令守卫 `projectCommands.ts`：HTTP 与 sync 使用相同 ProjectStatus 枚举、`STATUS_TRANSITIONS` 图、`projects.update` 系统权限和项目 `transition` 能力；进入 `ARCHIVED` 额外要求独立 `projects.archive`。非法边统一拒绝。
- HTTP 项目 PUT 与 batch status 接口使用共享规则；batch endpoint 也要求 `projects.update`。详情 `allowedTransitions` 使用同一状态机常量。
- sync generic project fields 移除 `status` 和 `managerId`。status 走显式共享命令校验后才进入 CAS 更新；managerId 输入明确拒绝，等待 D-S01-06 批准后由负责人转移命令处理。
- 已检查 registrations 路由：它只更新项目基础资料和 registration profile/currentStage，没有直接写 `project.status`；registration 阶段仍要求原 `/stage` 专用路由。本任务未改负责人转移路径。
- 新增隔离集成场景：仅有 projects.update 的归档拒绝、持有 archive 但越过状态边仍拒绝、HTTP/sync 相同合法转换、sync managerId 在待裁定时拒绝。未运行。

## 影响边界

- 无 schema、migration、依赖或数据库变化。
- 成员可编辑项目资料但不具 `transition` 能力时，改变项目状态将被拒绝；相同状态随普通编辑提交不触发转换能力要求。
- managerId sync 变更在 D-S01-06 未批准期间 fail closed；HTTP/register manager-transfer 语义尚未统一，留给 RP07-T02。
- PC03 仍 PROPOSED。当前 sync 写入仍遵循既有 receipt/audit 路径，本任务没有宣称原子 receipt/严格审计或 INT-PC03-01 通过。
- 没有运行 migration、API/sync DB 场景或部署。B09 仍待动态验收。
