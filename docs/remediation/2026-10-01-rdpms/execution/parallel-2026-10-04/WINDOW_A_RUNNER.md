# 窗口A：LR7-01运行器修正

先读COMMON_RULES和清单。唯一可写：`S/window-a-runner/`。现有代码/测试/台账及其它窗口全只读。

## 任务与读序

仅修复制的新runner，关联LR7-01/CLOSE-02/LR6-02。
读取O/run-suite.py、controls/run-runner-controls.py及六控制原始记录；读取R/evidence/runner-log-failure-controls.py/.json和两个反例日志。保留原正常25/25证据，不运行真实DB/构建。

## 固定实现

1. 启动登记后，将runner复制到自己的目录。先登记失败命令/主异常/critical状态，再尝试可失败的日志写入。
2. 正常命令日志OSError也计入criticalFailures；异常日志再失败不能丢掉TimeoutExpired/FileNotFoundError等原原因。独立fallback/stderr保留双重错误，不能假成功。
3. 外层try/except捕获主执行异常；finally仅清理。结果持久化和最终非零决定在清理结束后，不在finally用成功SystemExit覆盖异常。
4. 命令、drop/stop/dist/temp的错误独立处理；stop失败保留确认自有的模拟根并写释放条件。结果写盘失败非零，fallback使用当前attempt唯一目标，避免覆盖旧失败。
5. runner的真实模式只保留接口，本轮不启用。所有控制在调用前stub全部subprocess，并把写入/临时资源限定在本窗口；不得写真实backend/dist或冻结O/R。

## 必跑九路径（只安全模拟）

- 原六项：build非零、drop异常、stop非零、build TimeoutExpired、suite spawn FileNotFoundError、run-results写盘OSError。
- R的两个原反例：正常suite命令日志写盘OSError；build超时后超时日志再OSError。
- 一项正常路径：所有模拟命令/日志/结果/清理成功，runner退出0。

八失败路径须非零且保留确切原因/命令/cleanup；正常路径0。stop控制保留的模拟根确认没有真实进程后清理；命令日志失败的原异常必须可读回。明确kind为SIMULATED_CONTROL，不填产品PASS。
先以正常路径证明模拟夹具/预检/写盘/清理有效，再执行八条失败路径；逐项断言预定故障实际命中。预检失败或其它无关非零不能代替预期故障控制通过。
保存每路径摘要、原始输出、运行器hash、控制脚本hash、资源清理。没有通过的路径不得改断言/跳过/标完成。

## 交付/停止

交付共同七类及新runner/控制源码、九路径结果。ROOT文件、两份state/handoff/history写入数必须0。WORKER_MANIFEST与READY仅在自己的目录，完成后停止等汇总。不要替B生成最终batch seal或更新根台账。
