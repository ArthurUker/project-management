# 回滚说明（readiness-amendment-01）

## 本补正的隔离性
本补正**仅**在以下目录新增文件，未修改任何共享或既有文件：
`docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-a-runner/readiness-amendment-01/`

未触碰：原 A 既有文件（843 文件含 run-suite.py / runner-controls.py / 原 READY / 原 WORKER_MANIFEST / 七类 /
controls/ 全部 attempt 与日志 / evidence/）、正式运行器、业务代码、正式测试、共享台账
（state.json / IMPLEMENTATION_STATE.json / HANDOFF.md / REVISION_HISTORY.json）、其他并行窗口、记忆文件。

## 回滚步骤
1. 仅删除本补正目录即可完整回滚，无外溢副作用：
   `rm -rf docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-a-runner/readiness-amendment-01/`
2. 不回滚原 A：原 A 字节不变，仍可被汇总窗口按原规则聚合（其原 READY/manifest 哈希与 REVIEW.md 一致）。

## 不影响
- 不重跑任何 runner/控制/构建/测试/数据库；无真实库、构建产物、服务或业务测试被改动。
- 未启动、修改或删除任何集群、数据库、服务器或浏览器会话。
