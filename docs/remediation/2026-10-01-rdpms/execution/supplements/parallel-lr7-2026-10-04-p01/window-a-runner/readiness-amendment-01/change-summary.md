# LR7-01 窗口 A 交付协议补正（readiness-amendment-01）

## 1. 背景
六窗口交付门禁复核（`docs/remediation/2026-10-04-parallel-handoff-check/REVIEW.md`，PH-01）指出：
- 原 A 的 `READY.json` / `WORKER_MANIFEST.json` 缺交付协议必填字段（batchId / windowId / scope /
  workerManifest / actualResults / notRun / pendingApprovals / independentReview / release / writerStopped）。
- 原 A 目录共 **843** 文件，旧 manifest 仅列 **11** 条；另有 **830** 文件（含 `controls/` 原始日志与历次
  attempt）未绑定。

本补正按 `A_READY_AMENDMENT_PROMPT.md` 在 **N = readiness-amendment-01/** 前缀追加交付协议，原 A 全部字节不变。

## 2. 严格边界
- 唯一新增写入目录：`.../window-a-runner/readiness-amendment-01/`（N）。
- 原 A 既有文件（run-suite.py、runner-controls.py、原 READY/原 manifest、七类、controls/ 全部 attempt 与
  日志、evidence/ 等 **843** 文件）字节不变。
- 不重跑 runner/控制；不执行 build/test/数据库/浏览器；不安装依赖、不启子代理；不修改业务代码、正式测试、
  其他窗口、根台账、记忆文件；不 stage/commit/push/merge/deploy/reset/clean/stash。
- 九路径证据为**复用原执行者模拟控制证据（REUSED_EXECUTOR_SIMULATED_EVIDENCE）**，非独立重新验证或产品
  验收；实际动态运行次数 **0**。

## 3. 原 A 成果（复用，未改动）
- 修正后的隔离集成运行器 `run-suite.py`（sha256 `718d760649934d3351c8e0071e12470cbba50f23861fefb45a94d83f818064ce`）
  修复两处假成功（命令日志写盘 OSError 被吞、finally 的 `sys.exit(0 if not critical else 1)` 以 0 覆盖）。
- 控制脚本 `runner-controls.py`（sha256 `14b554172c847819798e229d7bfd6158f814e2041d3c88193f54dd5c6c39a9ac`）
  九条路径全 stub，全通过：normal 退出 0；build-nonzero / drop-exception / stop-nonzero / build-timeout /
  suite-spawn-exception / result-write-oserror / normal-log-ioerror / timeout-log-ioerror 各自预定故障实际命中。
- 证据位于 `controls/<mode>/control-summary.json`、`controls/<mode>/control-output.log`、
  `controls/runner-controls-summary.json`，以及原 A `evidence/` 副本（`PATH_MATRIX.md`、`runner-controls-summary.json`）。

## 4. 交付基线（真实当前）
- HEAD `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`（与 REVIEW.md readback 一致）。
- 冻结计划摘要 `edad8b5937849ecb88ab282f4c2254b2faadee01d41020904c88996259d2d62d` 一致；283 受保护文件无漂移。
- 原 A（排除 N）当前 **843** 文件哈希与 REVIEW.md readback 记录逐一匹配 → **零漂移**。

## 5. 本补正产物（N）
authorization / change-summary / evidence（evidence-binding.csv）/ acceptance / rollback / task-state / handoff
（七类）+ REVIEW_ENTRY + 新 WORKER_MANIFEST + 新 READY。
新 manifest 以 `pathBase=REPOSITORY` 完整绑定原 A **843** 冻结输入与本次 N 静态产物（排除新 manifest 自身与新
READY）；旧 READY、旧 manifest 一并绑定并记 `supersedesReadyRef` / `originalManifestRef`。

## 6. 数量变化解释
旧 manifest 列 11 条 = run-suite.py、runner-controls.py、authorization.json、change-summary.md、
acceptance.json、rollback.md、task-state.json、handoff.md、REVIEW_ENTRY.md、evidence/PATH_MATRIX.md、
evidence/runner-controls-summary.json。原 A 共 843 文件 = 11（旧 manifest 列）+ 830（controls/ 原始日志、
历次 attempt、run-results 等未列）+ 原 READY.json + 原 WORKER_MANIFEST.json（2 个特殊冻结输入）。
本补正新 manifest 将 **全部 843** 原 A 文件纳入 `files`，并对 830 未列文件与全部 attempt 逐一绑定，不再遗漏。
