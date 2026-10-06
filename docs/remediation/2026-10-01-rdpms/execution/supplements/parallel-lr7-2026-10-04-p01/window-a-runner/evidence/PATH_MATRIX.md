# 路径矩阵（LR7-01 窗口 A 九条安全模拟路径）

所有路径均以 `runner-controls.py` 全 stub 执行（SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED）：
不启动真实数据库/构建/服务；写盘与临时根限定本窗口。

逐条证据位置：`controls/<mode>/control-summary.json`（结构化）与 `controls/<mode>/control-output.log`（运行输出）。
汇总：`evidence/runner-controls-summary.json`（与 WORKER_MANIFEST 同源）。

| 路径 | 退出码 | criticalFailures | primaryExceptions | 命中预定故障 |
|---|---|---|---|---|
| normal | 0 | 0 | 0 | 夹具/预检/写盘/清理有效，无泄漏 |
| build-nonzero | 1 | 1 | 0 | backend-build 返回 1 |
| drop-exception | 1 | 2 | 1 | guard-drop FileNotFoundError；cluster-stop 仍执行 |
| stop-nonzero | 1 | 2 | 0 | cluster-stop 返回 1；保留确认自有的模拟根 + releaseCondition |
| build-timeout | 1 | 2 | 1 | backend-build TimeoutExpired |
| suite-spawn-exception | 1 | 2 | 1 | node --test FileNotFoundError |
| result-write-oserror | 1 | 1 | 0 | run-results.json 写盘 OSError；fallback 落盘，resultsPersistence.ok=false |
| normal-log-ioerror | 1 | 1 | 0 | 正常 suite 命令日志写盘 OSError 记为 critical（R 假成功反例①已修） |
| timeout-log-ioerror | 1 | 3 | 1 | build 超时原因为主 + 超时日志再 OSError 次级（R 假成功反例②已修，双重错误保留） |

## 断言纪律
- 先正常路径证明模拟有效，再八条失败路径；每条失败断言其**特定**故障实际命中。
- 预检失败或其他无关非零不得替代预期故障控制通过（见 `assert_failure` 中按模式校验具体 criticalFailure/primaryException/releaseCondition）。
- 无路径以假成功（退出0但 criticalFailures 非空）或逃逸异常收尾。
