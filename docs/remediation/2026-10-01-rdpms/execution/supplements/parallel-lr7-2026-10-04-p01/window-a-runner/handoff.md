# 交付说明（LR7-01 窗口 A → 汇总窗口）

## 交付物（本窗口目录内）
- `run-suite.py`：修正后的隔离集成运行器副本（SHA256 见 WORKER_MANIFEST.json）。
- `runner-controls.py`：九路径全 stub 控制脚本（SHA256 见 WORKER_MANIFEST.json）。
- `authorization.json` / `change-summary.md` / `acceptance.json` / `rollback.md` / `task-state.json` / `handoff.md` / `REVIEW_ENTRY.md`：共同七类 + 审查条目。
- `evidence/`：九路径逐条 `control-summary.json`（位于 `controls/<mode>/`）、`runner-controls-summary.json` 汇总、本文件。
- `WORKER_MANIFEST.json` / `READY.json`。

## 关键结论
- 运行器修复两处假成功（R 复审反例）：正常命令日志 OSError 与超时后日志再 OSError 现在均如实退出非零。
- 九条路径全通过（1 正常 + 8 失败），每条失败路径的**预定故障实际命中**，非预检失败或其他无关非零替代。
- 清理逻辑：命令/drop/stop/dist/temp-root 相互独立；stop 失败保留确认自有的模拟根并写释放条件。
- 范围合规：仅本窗口新增；不启动真实数据库/构建/业务测试；不写真实 backend/dist 或冻结 O/R；不改动共享台账与其他窗口。

## 交接给汇总窗口
- 请汇总窗口读取 `WORKER_MANIFEST.json` 与 `READY.json`，核对各文件 SHA256，纳入 `state.json` 窗口聚合。
- 本窗口**未**重写任何被封存文件、未修改共享台账、未选择其他任务。
- 如发现某条路径未通过，请勿改写本窗口断言或标记为完成；应退回窗口 A 重做。
