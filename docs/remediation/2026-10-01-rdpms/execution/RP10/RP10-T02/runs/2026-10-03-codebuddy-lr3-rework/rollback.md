# RP10-T02 返工（LR3-01）— 回滚说明

## 本地变更撤销（未提交，dirty worktree）

1. `rdpms-system/backend/src/routes/reports.js`（execute 分支）
   - 恢复被删除的无条件 upsert：
     `tx.report.upsert({ where: { projectId_authorId_reportType_periodKey: uniqueKey }, update: { content, updatedById, deletedAt: null }, create: {...} })`
   - 审计 action 恢复为 `current ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE`，metadata 去掉 `restoredFromTombstone`。
   - 删除墓碑恢复的条件 `updateMany` 分支与其中的 409 `CONFLICT`。
2. `rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
   - 删除本轮新增的 A01–A06b 八个用例、`POST_PERMS`、`gateOnReportMethod`、`reachBarrier`、`postReport`、`submitReport`、`PERIOD`。
   - 保留本文件既有的 9 个用例（含上一轮的 late PUT / sync / replay / 版本分配）。

注意：该文件同时承载上一轮未提交改动，不能用 `git checkout` 回退到 HEAD。本轮还原时使用的修复版副本位于
`/tmp/reports-lr3-fixed.js`（临时目录，非仓库），仅用于反例对照后的精确还原。

## 反例对照的可复现步骤（用于审阅复核）

1. 备份当前 `reports.js`；
2. 把 execute 的「墓碑恢复 + create」两块替换回无条件 `upsert`；
3. 运行 `node --test tests/integration/rp10-report-submit-snapshot.integration.test.mjs`（自有库）→ 17 项中 5 项失败；
4. 还原修复版 → 17/17 通过。
证据：`evidence/negative-control/attempt-01/`。

## 数据与 schema

- 无迁移、无字段/结构变化。运行副作用只在自有一次性 `rdpms_test_*` 库（已 guard drop、集群已停止）。
- 未删除任何版本行、未重置 status/currentVersion、未触碰 append-only 审计。

## 安全边界

- 撤销后回到「POST 无行/恢复分支可无条件覆盖已提交正文」的既有缺陷状态（LR3-01），**不是**可发布的安全旧版本。
- 生产/目标环境回退演练未执行 → `NOT_RUN`；未提交、未部署。
