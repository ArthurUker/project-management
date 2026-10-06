# REVIEW_ENTRY — lr6-closeout-2026-10-04-cb1（供独立审阅）

## 1. 读序

1. `authorization.json` → `evidence/start-baseline.json` → `evidence/start-copies/`（编辑前 rp10 字节副本，hash 校验）
2. `CLOSE-02/`：`change-summary.md` → `evidence/runner-controls-summary.json` → `controls/runner-controls.json`
   → `controls/<mode>/control-summary.json` 与 `control-output.log`（六项）
3. `CLOSE-01/`：`change-summary.md` → `evidence/matcher-identity-control.json`
   → `evidence/draft-upsert-compat.json` → `evidence/draft-race-settle-control.json`
   → `evidence/suite-run.json` → `evidence/test-case-inventory.json` → `CLOSE-01/runs/rp10-suite/attempt-02/`
4. `CLOSE-04/`：`scope-errata.md` → `evidence/phase-scope-static-trace.json`
5. `CLOSE-03/`：`change-summary.md` → `evidence/payload-manifest.json` → `final-integrity.json`
   → `post-seal-readback.json`
6. `SESSION_SUMMARY.md` → `resume.md` → `next-business-inputs.md`

## 2. 运行与日志

| 对象 | 路径 | 要点 |
|---|---|---|
| 最终报告套件（真实自有库） | `CLOSE-01/runs/rp10-suite/attempt-02/` | tests 25 / pass 25 / fail 0；build/typecheck/undefined/diff = 0；guard drop/stop = 0 |
| 失败 attempt（保留） | `CLOSE-01/runs/rp10-suite/attempt-01/` | helper 返回形状改变后三个草稿用例 destructure 报错；已修，日志保留 |
| 六项 runner 控制 | `controls/runner-controls.json` + `controls/<mode>/` | 全部 subprocess 模拟，退出码均 1，无真实集群 |
| 被取代的控制尝试 | `controls/_superseded-attempts/first-harness-run/` | 首次 harness 目录布局错误，日志保留 |
| 重建脚本 | `evidence/reconstruct-start-copy.py` | 逆变换重建编辑前测试，SHA256 = 清单基线 |

## 3. 对 LR6 四项的处置

- **LR6-01**：`matchReportWrite` 现要求完整业务键或 target id + 必需 marker（部分键/无 marker 不命中）；
  逐原语同源取参；`draftWriteBarrier` 复用该匹配器并证明真实 `upsert(where.id, create/update)` 命中；
  legacy/modern/sync 三条旧草稿竞争改为 `try/finally` + `settleGate`（timer 由 `reachBarrier` 清理）。
  新增三条用例（SUP-01-05/06/07），原 22 条名称与断言保留，共 25 条。
- **LR6-02**：新 runner 记录主流程 `TimeoutExpired`/`FileNotFoundError`/其他启动异常到 `primaryExceptions`
  与 `criticalFailures`，cleanup 后按 `criticalFailures` 决定退出码（finally 内无成功 `sys.exit(0)`）；
  `run-results` 写盘失败返回非零并写 fallback 到不同目标；drop/stop/dist/temp 各自隔离；
  stop 失败保留自有根 + 释放条件。六项安全模拟控制全部非零。
- **LR6-03**：两个 registry 各追加**唯一**新 entry（含 `sessionId` 与 `correctsRef`：下标 + 旧 ID + 旧条目规范化 SHA256 +
  旧 session 路径）；payload-manifest / final-integrity / post-seal-readback 三层封存互不包含自身或两份 history 的最终 hash。
- **LR6-04**：新 `CLOSE-04/scope-errata.md` 分别陈述单项目 404 与全局可见性过滤（`projectVisibilityFilter`
  对 manager/活跃成员可见、`SUPER_ADMIN` 无过滤、**无 `project.deletedAt` 条件**），引用当前行号。

## 4. 复用与限制

- SUP-02：**复用**独立复核证据（12/12、101/101），`evidenceMode = REUSED_INDEPENDENTLY_VERIFIED_EVIDENCE`；
  同步测试 hash 与复核基线一致；**本轮未重跑 rp08**，不得写成“本轮 PASS”。
- 六项 runner 控制为 `SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED`，**不是**真实数据库故障验收。
- 未运行：JWT 全链、前端 IDB/UI、阶段动态 API/UI、目标/候选环境、部署。
- 未批准：阶段软删/过滤政策仍 `CONTRACT_UNRESOLVED`；31 个历史开放项与 B04/B10/B14/B20 未关闭。

## 5. 需独立审阅确认

1. 完整身份匹配的 16 组 helper 控制是否满足 LR6-01 的“完整键/标记必须同时生效”。
2. `draftWriteBarrier` 的真实 upsert 命中（含两个负例）是否足以替代“仅把 upsert 加进 methods”的问题。
3. 三条旧草稿竞争的 `finally` + timer 清理 + 收束是否符合要求（原断言未削弱）。
4. runner 六项控制是否覆盖 LR6-02 的四条要求（尤其“写盘失败必须非零 + fallback”与“stop 失败保留自有根”）。
5. `correctsRef` 与唯一 ID 是否足以订正旧重复 ID；封存是否存在残留循环引用。
6. 原 54/306 轴、包状态、门禁与冻结证据是否零变化。
