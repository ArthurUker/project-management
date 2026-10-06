# 原窗口 A：仅交付协议补正

将下面整段交给原 A 执行窗口。此轮不重跑控制，不修 runner，不动业务代码。

```text
你是本批次原窗口 A 执行者。请完成一次有界交付协议补正，实际落盘后停止。按规定步骤执行，不扩大审阅或自行选择修复任务。

仓库 ROOT：/Users/renkang/VS Code/project-management
计划 P：docs/remediation/2026-10-01-rdpms/
原指令 Q：P/execution/parallel-2026-10-04/
批次 S：P/execution/supplements/parallel-lr7-2026-10-04-p01/
原 A：S/window-a-runner/
本次唯一新写入前缀 N：S/window-a-runner/readiness-amendment-01/
补正依据：docs/remediation/2026-10-04-parallel-handoff-check/REVIEW.md

本条授权只允许在 N 新增交付协议/证据引用/封存文件。原 A 全部既有文件，包括 READY、WORKER_MANIFEST、runner、控制脚本、摘要、日志和失败 attempt 保持字节不变。其他窗口、Q、根台账、业务代码、测试、配置、数据库和记忆文件都不可写。若 N 已有结果，先读取接续，禁止覆盖旧 attempt 或已定稿文件。

先完整读取：新 REVIEW.md、evidence/readback.json；Q/COMMON_RULES.md、WINDOW_A_RUNNER.md、BATCH_MANIFEST.json；原 A 的 READY、manifest、authorization、acceptance、task-state、handoff，以及九路径原始摘要和对应原始日志。现有读序和安全边界继续有效。本指令只替代“不得再写 A”的部分：仅允许在 N 追加，绝不改旧字节。

固定步骤：
1. 核对 HEAD、git status、283 受保护文件及冻结摘要。登记本次 authorization 和真实当前 start-baseline。不能倒填历史启动证据。明确原 A 写入者已结束，且本次只有本窗口写 N；无法确认时交付 BLOCKED，不代写他人停写声明。
2. 对原 A（排除 N 整个前缀）生成完整逐文件输入清单。复核检查点为 843 文件，其中旧 manifest 11 条匹配，另有 830 文件未列入。数量变化必须解释；不删除、移动或忽略失败 attempt。原 READY/manifest 也作为冻结输入引用，非本次 manifest 自身。
3. 新 evidence-binding.csv 对九路径逐项记录真实已运行结果、runner/control 哈希、精确原 summary/log/run-results 路径、对应 attempt 与证据层次。区分 evidence 摘要和 controls 摘要的实际来源；禁止按 mtime 或“最大 attempt 编号”猜测历史结果。缺证据标 NOT_RUN/BLOCKED 并写解除条件；本轮不重跑，不修改旧摘要来消除差异。
4. 写 N 内七类交付与 REVIEW_ENTRY：authorization.json、change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md。acceptance 只评价此次材料读回与协议补正；九路径注明 REUSED_EXECUTOR_SIMULATED_EVIDENCE，非独立重新验证/产品验收。实际动态运行次数 0。
5. 定稿后在 N/WORKER_MANIFEST.json 封存本次所有新静态产物及原 A 全部冻结输入。统一 pathBase=REPOSITORY，relativePath 为真实仓库相对路径，每项完整 SHA256，逐文件读回。只排除本次新 manifest 自身、新 READY 和明确预先排除的读回产物；不得再漏掉原 controls/attempt/日志。已有旧 manifest、旧 READY 必须绑定。
6. 最后写 N/READY.json。必须包含 batchId=parallel-lr7-2026-10-04-p01、windowId=A、status=READY_FOR_AGGREGATION 或真实 BLOCKED/FAIL、scope、workerManifest（pathBase/path/sha256）、actualResults、notRun、pendingApprovals、independentReview=PENDING、release=NOT_EVALUATED、writerStopped=true。另记 supersedesReadyRef（原 READY 路径+实际 hash）、originalWriterStoppedConfirmed（真实确认）。pendingApprovals 如无该工具任务的业务门禁须说明工具范围；不能扩大为系统所有决定均已批准。
7. READY 写完后停止全部编辑。给出新 READY 路径及 SHA256、新 manifest SHA256、旧文件零漂移、实际未运行项和限制。

禁止：执行 runner/控制、真实 subprocess 验证、npm build/test、DB/JWT/IDB/browser；安装依赖、子代理、模型切换；改任意现有源码/测试/台账/旧证据；stage/commit/push/merge/deploy/reset/clean/stash；批准业务决定或启动其他 STANDARD 任务。仅可用本地标准库做文件读回、哈希和写新交付。

这不是 LR7-01 新代码返工。不得把材料补正写成新产品修复、原包 COMPLETE 或 FIX_ACCEPTED。只完成 N 后停止等待汇总。
```
