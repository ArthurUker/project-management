# CLOSE-02 变更摘要（新 session runner；冻结旧 runner 未改动）

- 新 runner：`execution/supplements/lr6-closeout-2026-10-04-cb1/run-suite.py`（SHA256 `36551b9281bc45209bdfb03f9912cba9e264b158c0b9599a4e0aacf3cb2a81a7`）；
  控制脚本：`execution/supplements/lr6-closeout-2026-10-04-cb1/controls/run-runner-controls.py`；结果：`controls/runner-controls.json`。
- 使用仓库**绝对路径** + 显式 pre-flight（ROOT/backend/guard 脚本/测试目标/compiler/initdb/pg_ctl）
  + 启动前 dist 归属检查，避免目录层数推导错误。

## 实现要点（对应 LR6-02）

| 要求 | 实现 |
|---|---|
| a 主流程异常记录 | `run()` 捕获 `TimeoutExpired` / `FileNotFoundError` / 其他启动异常，逐命令记录 label、argv、exceptionType、超时秒数或 message、退出语义与可用输出（去敏），写入 `primaryExceptions[]` |
| b 主异常加入 criticalFailures 且清理后仍非零 | 异常 → `fail(...)` → `criticalFailures`；退出码在 cleanup **之后**按 `criticalFailures` 计算，finally 内不存在成功 `sys.exit(0)` 覆盖待抛异常 |
| c 写盘失败必须非零 | `write_results()` 失败 → 记 criticalFailures，写 fallback 到**不同目标**（`run-results-fallback.json`）；fallback 也失败则原样打到 stderr；绝不“无结果但 exit 0” |
| d 清理各步隔离 | guard-drop / cluster-stop / dist / temp-root 各自 try/except；drop 异常后**仍尝试 stop**；stop 失败保留确认自有的 cluster root 并写精确解除条件 |
| e dist 判定 | 保持按文件系统判定；build 前登记 dist 归属；失败 build 的自有输出仍被检查并清理 |

## 六项固定控制（全部 subprocess 模拟，无真实集群）

| 控制 | runner 退出 | run-results | primaryExceptions | criticalFailures |
|---|---:|---|---:|---|
| build-nonzero | 1 | True | 0 | ["backend-build did not succeed"] |
| drop-exception | 1 | True | 1 | ["guard-drop could not be spawned: FileNotFoundError", "guard-drop cleanup did not succeed"] |
| stop-nonzero | 1 | True | 0 | ["cluster-stop cleanup did not succeed", "cluster-stop failed, owned temp root preserved (release condition recorded)"] |
| build-timeout | 1 | True | 1 | ["backend-build raised TimeoutExpired after 0.001s", "backend-build did not succeed"] |
| suite-spawn-exception | 1 | True | 1 | ["integration-suite could not be spawned: FileNotFoundError", "integration-suite did not succeed"] |
| result-write-oserror | 1 | False | 0 | ["run-results write failed at /Users/renkang/VS Code/project-management/docs/remediation/2026-10-01-rdpms/execution/supplements/lr6-closeout-2026-10-04-cb1/controls/result-write-oserror/attempt-04/run-results.json: OSError: injected result persistence failure"] |

- 全部六项均 `observedExitCode = 1`（预期非零）、无未捕获异常、无自有根残留、无 dist、未启动真实数据库。
- drop-exception：`guard-drop` 之后**仍执行** cluster-stop（`clusterStopExit=0`）。
- stop-nonzero：runner 保留模拟自有根并记录 `releaseCondition`；控制结束时确认无真实进程后释放。
- result-write-oserror：`run-results.json` 写入失败 → 退出非零 + fallback 写入不同目标。
- build-timeout / suite-spawn-exception：`primaryExceptions` 记录到具体命令与异常类型。

## 未做

- 未修改冻结旧 runner；未在故障控制中创建真实数据库；未把模拟控制冒充真实 DB 故障验收。
