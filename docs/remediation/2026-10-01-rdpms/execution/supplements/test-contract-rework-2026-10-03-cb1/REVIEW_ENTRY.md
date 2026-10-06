# REVIEW_ENTRY — test-contract-rework-2026-10-03-cb1（供独立审阅）

## 1. 读序

1. `authorization.json`（会话授权）→ `evidence/start-baseline.json`（起始基线，含 untracked 的完整业务文件集）
2. `evidence/start-copies/`（两个测试的起始副本与 sha256）
3. `SUP-01/`：`change-summary.md` → `evidence/barrier-migration.json` → `evidence/primitive-matrix.json`
   → `evidence/restore-submit-race.json` → `evidence/semantic-negative-control.json`
   → `evidence/settle-control.json` → `evidence/suite-run.json` → `acceptance.json`
4. `SUP-02/`：`change-summary.md` → `evidence/field-trace.json` → `deliverables/field-comparison.csv|md`
   → `evidence/suite-run.json` → `acceptance.json`
5. `SUP-03/`：`change-summary.md` → `deliverables/phase-read-contract.md` → `scope-assessment.md`
   → `coverage.csv` → `next-action.md` → `evidence/phase-read-trace.json` → `acceptance.json`
6. `controls/runner-controls.json` 与 `controls/*/attempt-01/run-results.json`（runner 失败路径控制）
7. `final-integrity.json`（封存核对）→ `SESSION_SUMMARY.md` → `resume.md`

## 2. 运行与日志清单

| 对象 | 路径 | 内容 |
|---|---|---|
| rp10 套件（最终） | `SUP-01/runs/rp10-suite/attempt-05/` | run-results.json + 各命令日志 + integration-suite.log（22/22） |
| rp10 失败尝试 | `SUP-01/runs/rp10-suite/attempt-01`、`attempt-02` | 四原语矩阵内 `periodKey` 缺值 ReferenceError（保留） |
| rp08 套件（最终） | `SUP-02/runs/rp08-suite/attempt-03/` | run-results.json + 日志（12/12） |
| rp08 失败尝试 | `SUP-02/runs/rp08-suite/attempt-02` | runner dist 清理判定缺陷（已修 runner，保留日志） |
| runner 控制 | `controls/build-fail`、`controls/drop-raise`、`controls/stop-fail`（各 3 个 attempt） | SIMULATED_CONTROL，退出码见 `controls/control-exit-codes.json`；手动释放见 `stop-fail/manual-release.json` |
| 起始基线生成 | `evidence/make-baseline.py` | 只写 session 目录 |
| 交付生成 | `make-deliverables-1.py`、`make-deliverables-2.py`、`SUP-02/make-field-table.py` | 只写 session 目录 |

## 3. 关键结论与口径

- SUP-01：屏障统一为 `gateReportWrite` + `matchReportWrite`（create/upsert/update/updateMany）；
  四原语各自独立真实命中；新增「墓碑恢复 → 赢家恢复 + submit → 迟到 409 CONFLICT」正式用例；
  保留真实 DB `SEMANTIC_NEGATIVE_CONTROL`（exit 0 只表示识别到坏结果）；失败路径仍释放并收束。
- SUP-02：七实体正例与拒例改为**同一 actor**（userId / systemRole / 成员资格 / 报告作者归属不变，
  权限差集 = 目标项）；字段表按实际读投影与运行结果重建，纠正旧表把
  `code/templateId/completedAt/submittedById/reviewNote/reviewedAt` 误列为禁止字段的问题。
- SUP-03：只读。补齐详情内嵌 phases（`projects.js:341`）与全局阶段列表（`phases.js:45`）；
  阶段资源 DELETE/restore 为 `NOT_FOUND`；`phases.js:194` 是流转边 DELETE（易混淆项）；
  前端 `projectAPI.phases` 无直接调用者（`NOT_FOUND`），`PhaseProgressBar` 读的是模板阶段；
  B20 / `PAC-RP04-03` 原文为**项目级**范围；阶段过滤政策 `CONTRACT_UNRESOLVED`；UI/动态 `NOT_RUN`。

## 4. 需要独立审阅确认的事项

- 四原语兼容矩阵是否满足「各自真实命中」的裁定口径（不是 create 命中后内部 upsert 充数）。
- 同账号撤权对照是否足以替代此前「member 成功 / zero 账号拒绝」的混成对照。
- 字段表纠正是否与当前读投影一致（旧表误列已明示纠正，旧记录保持冻结）。
- SUP-03 的 `NOT_FOUND` / `NOT_RUN` / `CONTRACT_UNRESOLVED` 分级是否充分。
- runner 三项控制是否覆盖 LR5-05 的「异常隔离 + 结果必写 + 清理失败影响退出 + stop 失败保留目录」。
- `final-integrity.json` 的逐文件 sha256 起止一致性与冻结根无漂移。
