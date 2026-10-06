# 回滚说明（LR7-01 窗口 A）

## 本交付的隔离性
本任务**仅**在以下目录新增文件，未修改任何共享或既有文件：
`docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-a-runner/`

未触碰：正式运行器、业务代码、正式测试、共享台账（`state.json` / `IMPLEMENTATION_STATE.json` /
`HANDOFF.md` / `REVISION_HISTORY.json`）、其他并行窗口（B/C/D）。

## 回滚步骤
1. 删除本窗口目录即可完整回滚，无任何外溢副作用：
   `rm -rf docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-a-runner/`
2. 若仅想撤销运行产物而保留源码/交付：删除 `window-a-runner/controls/` 下的 `attempt-*` 运行目录与
   `_owned_tmp`（含 `_trash`）即可；`_owned_tmp/_trash` 中的内容为本窗口自有模拟临时根（已被迁出的目录），
   删除无真实库/服务影响。

## 不影响
- 不修改 main 分支代码或既有运行器。
- 不改动任何数据库、构建产物、服务器或业务测试。
- 不写真实 backend/dist 或冻结 O/R。
