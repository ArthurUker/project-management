# A 补正交付独立复核（2026-10-04）

## 裁定

**A_READINESS_GATE_PASS_WITH_EVIDENCE_LIMITS**：A 的交付协议与文件覆盖门禁通过，可启动既定汇总接续。本裁定范围仅为 A 的补正与汇总入口，不是整个批次、LR7-01 运行器行为、产品修复或发布验收。

## 已确认

- 新 READY SHA256：`ec5ac4bc7b2856afecbd73d8201288d90337e7077f4935126ed35f51ecd434b8`。
- 新 manifest SHA256：`3bcd2abd8f8380fa98fcb813f6b629a6c163aa2f292970ace705b510417ff5d3`；READY 引用一致。
- 851 条 manifest 均匹配磁盘：原 A 843 文件 + 新补正 8 个静态产物。无漏项、额外条目或哈希失配；新 manifest/READY 明确排除自身封存。
- 原 A 843 文件与前轮独立复核库存一致；其余五窗口与 283 受保护文件不变，冻结计划 2335 文件摘要一致。
- 新 READY 必填字段完整，原执行者声明 originalWriterStoppedConfirmed=true、writerStopped=true。声明已被引用与封存，不把它说成操作系统进程验证。
- 九个 control-summary 的 mode、退出码、runner hash、控制日志及 attempt 文件清点与 CSV 一致；正常 0、八个故障 1 来自已有执行者记录，本次未重跑。

## 非阻断的证据限制

补正 CSV 的 attemptsPresent / attemptsWithRunResults 是目录清点，没有给出每条结果唯一对应的 run-results 路径；evidenceLevel 还写了 evidenceCopy。独立静态读回确认，九条 evidence/runner-controls-summary.json 中记录的临时资源身份均与 controls 下当前摘要不同，属于不同历史 attempt，不能称同一执行结果的副本。

本复核的 readback.json 已按实际 ownedTempRoot 身份逐项匹配 run-results，记录精确路径和哈希。匹配依据为已记录的资源身份，不使用 mtime 或最大 attempt 编号。controls 摘要与 controls 聚合的身份和退出结果一致。八条主结果成功持久化路径分别找到唯一匹配记录；result-write-oserror 原主结果写盘失败，不能补造主 run-results，其控制摘要/日志保留执行者失败及 fallback 报告，本复核不把它升级成动态验收。

汇总窗口引用本补充绑定记录即可；原 A 已封存文件保持不变，不需要新增 A 返工。九路径仍为 REUSED_EXECUTOR_SIMULATED_EVIDENCE，完整运行器独立动态验收 NOT_EVALUATED。

## 下一步

执行既有 INTEGRATOR_RESUME_PROMPT.md，读取本复核及 readback，完成 D 哈希新技术绑定、B 额外输入封存、READY 字段规范化、C～F 未签方案汇总、六根记录限定追加和完整封存。其它未批准业务任务仍不能启动。

原 A rollback.md 中的删除补正目录示例本轮未执行；进入汇总证据后不得用删除封存证据作为回滚。需要撤回时追加撤回/替代记录，保留原字节。

原 54 任务仍 36 项未完成实施；原状态、所有待批决定和发布状态不变。此轮仅新增独立复核文件，没有修改 worker 或根记录、执行控制、构建、业务测试或数据库验证。
