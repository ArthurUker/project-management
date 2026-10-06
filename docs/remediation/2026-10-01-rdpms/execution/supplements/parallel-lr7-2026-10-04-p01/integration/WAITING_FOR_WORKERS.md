# WAITING_FOR_WORKERS — 汇总门禁未通过（aggregation halted）

- batchId: `parallel-lr7-2026-10-04-p01`
- recordedBy: integrator (SIX_WINDOWS mode)
- recordedAt: 2026-10-04
- status: **WAITING_FOR_WORKERS** — 未执行任何根台账追加 / 封存 / 整合交付写入

## 门禁依据

COMMON_RULES §5 + INTEGRATOR.md「启动门禁」+ 用户指令：选定模式的各窗口必须 **均已存在 READY.json 且 `writerStopped=true`**，WORKER_MANIFEST 逐文件核对一致。缺 READY 或仍在写入（`writerStopped != true`）时，记录 `WAITING_FOR_WORKERS` 并停止，不抢写根台账、不无限轮询。

## 逐窗口核对

| 窗口 | READY.json 存在 | `writerStopped=true` | 说明 |
|------|----------------|----------------------|------|
| A | ✅ | ❌ **缺失该字段** | READY 使用旧格式（window/taskId/status/kind/paths…/manifest/note），无 `writerStopped` 字段 |
| B | ✅ | ✅ | — |
| C | ✅ | ✅ | — |
| D | ✅ | ✅ | READY 中 `workerManifestSha256=PENDING_SELF_EXCLUDED`（自身排除，非缺失） |
| E | ✅ | ✅ | — |
| F | ✅ | ✅ | — |

## 阻断项

窗口 **A 的 READY.json 缺少强制字段 `writerStopped=true`**（COMMON_RULES §5 要求每个窗口 READY 必须包含）。缺少该字段即视为「仍在写入」，汇总门禁不成立 → 停止。

## 已完成的只读核对（未修改任何文件）

- **A 实质交付完整**：WORKER_MANIFEST.json 所列 11 个文件 SHA256 与磁盘实际一致
  （`run-suite.py` 718d7606…、`runner-controls.py` 14b55417…、`authorization.json` dda0c95f…、
  `change-summary.md` bd2fab82…、`acceptance.json` 6ddeccdd…、`rollback.md` 6eb25d71…、
  `task-state.json` 4fcc44be…、`handoff.md` 1c1ef92a…、`REVIEW_ENTRY.md` 24225303…、
  `evidence/PATH_MATRIX.md` 8582dae4…、`evidence/runner-controls-summary.json` f9b432a5…）。
  9/9 安全模拟路径通过（`paths.passed=9, failed=0`），仅 READY 形式不合规。
- **B/C/E/F 自哈希一致**：各自 WORKER_MANIFEST.json 的 SHA256 与 READY 中声明匹配
  （B 89fd24b7…、C 5898eb3e…、E cc03bd53…、F 75475cb2…）；D 显式 `PENDING_SELF_EXCLUDED`，无不符。
- B 含 519 旧会话文件引用，其 WORKER_MANIFEST 逐文件字节一致性本轮未全量重算；门禁已因 A 失败，故未继续，待 A 修复后由重跑汇总统一核验。

## 未执行（因门禁失败）

- 未追加六个根记录（IMPLEMENTATION_STATE / execution/state / 两级 handoff / 两份 history 各唯一订正 entry）。
- 未生成 `integration/payload-manifest.json`、`final-integrity.json`、`post-seal-readback`。
- 未写任何 integration 交付（change-summary / evidence / acceptance / rollback / task-state / handoff / REVIEW_ENTRY / resume）。
- 未修改任何 worker 文件、根台账、或 execution 指令目录 Q。

## 解除条件

窗口 A 重新签发 `READY.json`，补上 `"writerStopped": true`（建议同时补 `workerManifest.sha256` 自引用），保持 `writerStopped=true` 且文件未再变动；之后重新启动汇总窗口即可继续。**A 的实质交付无需重跑**——其 11 文件已验证一致、9/9 模拟路径通过，仅需补齐 READY 形式字段。

## 状态保留（未被改动）

- 所有待聚合交付保持 `independentReview=PENDING`、`release=NOT_EVALUATED`。
- 原 54/306 轴、包状态、31 开放项、业务批准均保持真实原状态。
- 未启动任何受门禁约束的业务任务，未代签任何 PROPOSED 材料。
