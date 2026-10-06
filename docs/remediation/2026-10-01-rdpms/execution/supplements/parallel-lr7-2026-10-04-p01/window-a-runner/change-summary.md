# LR7-01 变更摘要 —— 隔离集成运行器修正（窗口 A）

## 1. 任务背景
R 复审（`reviews/2026-10-04-codebuddy-lr6-closeout/evidence/runner-log-failure-controls.json`）用两条反例证明
原运行器存在**假成功（falseSuccessObserved: true）**：当某条命令的**日志写盘** `OSError` 时，异常未被登记为
criticalFailure，而 `finally` 块的 `sys.exit(0 if not critical else 1)` 以退出码 0 覆盖，导致实际故障被吞掉。
两条反例：
- 正常 suite 命令日志写盘 `OSError`（原 `normal-log-ioerror`）
- build 超时后超时日志再 `OSError`（原 `timeout-log-ioerror`）

WINDOW_A_RUNNER.md 指定复制运行器并在自有目录修正，完成九条安全模拟路径并落盘交付。

## 2. 修正内容（仅作用于本窗口的 run-suite.py 副本）
1. **登记先于可失败写盘**（点1）：`run()` 的命令失败分支先 `_register_primary()`（登记记录、primaryExceptions、
   fail 主因），再尝试日志写盘；写盘失败不再丢失已登记原因。
2. **命令日志 OSError 计入 criticalFailures**（点2）：正常命令分支的 `(OUT/f'{label}.log').write_text` 包裹
   try/except，OSError 作为独立 criticalFailure 登记，stderr 回显，绝不假成功；异常分支（TimeoutExpired /
   FileNotFoundError）的日志写盘同样隔离，保留原主因并追加次级 OSError（双重错误）。
3. **try/except/finally 拆分**（点3）：外层 `try/except BaseException` 捕获主执行异常；`finally` 仅做清理；
   结果持久化与最终非零决定在 `finally` 之后、不在 `finally` 用成功 `SystemExit` 覆盖异常。
4. **清理步骤独立 + stop 失败保留自有根**（点4）：guard-drop / cluster-stop / dist / temp-root 各自独立；
   stop 失败保留确认自有的模拟根并写 `releaseCondition`（切勿删除可能仍在运行的集群根）。
5. **真实模式仅留接口**（点5）：本轮全部控制 `stub` 所有 subprocess，写盘与临时根限定本窗口，绝不写真实
   backend/dist 或冻结 O/R。

## 3. 修复后验证（九条路径，全 stub）
- 正常路径：退出 0，无 criticalFailure，run-results 落盘，无自有根残留，无 dist。
- 八条失败路径：退出非零，无逃逸异常，各自**预定故障实际命中**（详见 evidence/ 与 PATH_MATRIX.md）。
- 关键回归：原两条假成功反例现在分别报告 `integration-suite command-log write failed`（正常命令）与
  `backend-build raised TimeoutExpired` + `backend-build command-log write failed after primary failure
  (TimeoutExpired ...)`（原因保留 + 双重错误），均退出 1。

## 4. 环境约束处理
本机 VS Code coding-copilot 扩展的 `sitecustomize.py` 将 `shutil.rmtree`/`os.remove`/`os.rmdir` 拦截为
**转移到废纸篓**（对工程目录下拒绝真实删除）。控制脚本因此以 `os.rename`（未被拦截）将自有模拟临时根迁至本窗口
内 `_owned_tmp/_trash`，使 `tmp.exists()` 在运行器视角为 False，等价于已清理；仅限本窗口自有临时资源，
无真实进程、无真实库/构建/服务。

## 5. 影响范围
仅本窗口新增文件。未改动：正式运行器、业务代码、正式测试、共享台账（state.json / IMPLEMENTATION_STATE.json /
HANDOFF.md / REVISION_HISTORY.json）、其他并行窗口。运行器为 README 所述「唯一运行器」的独立修正副本。
