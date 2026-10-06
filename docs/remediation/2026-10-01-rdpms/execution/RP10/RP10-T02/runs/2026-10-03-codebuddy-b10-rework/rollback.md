# RP10-T02 返工 — 回滚说明

## 本地变更撤销（未提交，工作区内）

撤销方式：把下列文件恢复到本轮开始前的**未提交**内容（注意：这些文件本身含上一轮连续执行的改动，不能回退到 HEAD，否则会一并丢失上一轮工作）：

1. `rdpms-system/backend/src/modules/reports/reportCommands.ts`
   - 删除 `import { REPORT_EDITABLE_STATUSES } from '../access/writeGuards.js';`
   - `saveReportDraft` 恢复为：无 `cas` 时 `db.report.update({ where: { id } })`；有 `cas` 时 `updateMany({ where: { id, ...cas } })`，count=0 直接 409 CONFLICT。
2. `rdpms-system/backend/src/routes/reports.js`（POST `/` 既有草稿分支）
   - 恢复自写 `tx.report.updateMany({ where: { id, updatedAt: expectedUpdatedAt ?? current.updatedAt }, data: { content, updatedById } })` 与"该汇报已被他人修改，请基于最新版本重试"文案。
3. `rdpms-system/backend/tests/helpers/stubDeps.mjs`
   - `$queryRaw` 恢复 `unimplemented('$queryRaw')`；`matchesWhere` 去掉 `{ in: [...] }` 分支；`state.rawQueries` 及其快照/还原项移除（恢复后 4 条契约用例会重新 500——属既有夹具缺口，不是本次修复引入）。
4. `rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
   - 删除本轮新增的 6 个用例与 `gatedClient` / `draftWriteBarrier` / `makeApp` / `makeReport` 辅助函数（保留原有 2 个用例）。

本轮已把本 run 开始前的两个源文件副本留在 `/tmp/cb-restore-rp10/`（临时目录，非仓库），仅用于本次还原核对；不影响仓库内容。

## 数据与 schema

- 无迁移、无字段/结构变化；不产生需要回退的数据形态。
- 运行时副作用只发生在自有一次性 `rdpms_test_*` 测试库（已 guard drop，集群已停止）。

## 安全边界

- 撤销后回到「迟到保存仍可 200 覆盖 SUBMITTED 正文」的既有缺陷状态；这不是"安全旧版本"，仅用于本地对照，不得作为生产回退目标。
- 生产/目标环境回退演练未执行 → `NOT_RUN`；本文件不假设存在可安全回退的旧版本。
- 未提交、未部署；无发布回退动作可申请。
