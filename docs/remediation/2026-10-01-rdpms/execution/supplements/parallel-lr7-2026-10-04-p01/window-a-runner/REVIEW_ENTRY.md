# REVIEW_ENTRY —— LR7-01（窗口 A）

- reviewDate: 2026-10-04
- reviewer: CodeBuddy（并行窗口 A 执行者 + 自审）
- taskId: LR7-01
- kind: SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED
- runnerSha256: 718d760649934d3351c8e0071e12470cbba50f23861fefb45a94d83f818064ce
- controlSha256: 14b554172c847819798e229d7bfd6158f814e2041d3c88193f54dd5c6c39a9ac

## 复审依据
- `reviews/2026-10-04-codebuddy-lr6-closeout/evidence/runner-log-failure-controls.json`（两份假成功反例）

## 修复要点（对应 WINDOW_A_RUNNER.md 五点）
1. 登记先于可失败日志写盘；写盘失败不丢主因。
2. 正常命令日志 OSError 计入 criticalFailures；异常分支日志再失败保留原 TimeoutExpired/FileNotFoundError 原因（双重错误）。
3. 外层 try/except 捕获主执行异常；finally 仅清理；持久化与最终非零决定在 finally 之后。
4. 命令/drop/stop/dist/temp-root 各自独立；stop 失败保留确认自有的模拟根并写 releaseCondition。
5. 真实模式仅留接口；全部控制 stub subprocess，写盘/临时根限定本窗口。

## 路径结果（9/9 PASS）
| 路径 | 退出 | criticalFailures | primaryExceptions | 命中故障 |
|---|---|---|---|---|
| normal | 0 | 0 | 0 | 全绿，无泄漏 |
| build-nonzero | 1 | 1 | 0 | backend-build 返回1 |
| drop-exception | 1 | 2 | 1 | guard-drop FileNotFoundError（stop 仍执行） |
| stop-nonzero | 1 | 2 | 0 | cluster-stop 返回1，保留自有根+释放条件 |
| build-timeout | 1 | 2 | 1 | build TimeoutExpired |
| suite-spawn-exception | 1 | 2 | 1 | suite FileNotFoundError |
| result-write-oserror | 1 | 1 | 0 | run-results 写盘失败+fallback 落盘 |
| normal-log-ioerror | 1 | 1 | 0 | 正常 suite 日志 OSError（原假成功反例①已修） |
| timeout-log-ioerror | 1 | 3 | 1 | build 超时原因保留 + 日志 OSError（原假成功反例②已修） |

## 范围合规
仅本窗口新增；不改动正式运行器/代码/测试/共享台账/其他窗口；不启动真实数据库/构建/业务测试；不写真实 backend/dist 或冻结 O/R。

## 结论
READY_FOR_AGGREGATION。
